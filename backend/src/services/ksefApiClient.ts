import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import { SettingsModel } from "../models/Settings";

const KSEF_ENVIRONMENTS = {
  test: {
    api: "https://api-test.ksef.mf.gov.pl/v2",
    app: "https://ap-test.ksef.mf.gov.pl",
  },
  demo: {
    api: "https://api-demo.ksef.mf.gov.pl/v2",
    app: "https://ap-demo.ksef.mf.gov.pl",
  },
  production: {
    api: "https://api.ksef.mf.gov.pl/v2",
    app: "https://ap.ksef.mf.gov.pl",
  },
} as const;

type KsefEnvironment = keyof typeof KSEF_ENVIRONMENTS;

export interface KsefSession {
  referenceNumber: string;
  accessToken: string;
  refreshToken: string;
  encryptionKey: Buffer;
  encryptionIV: Buffer;
}

export interface KsefSendResult {
  referenceNumber: string;
  ksefReferenceNumber?: string;
}

export interface KsefSettings {
  enabled: boolean;
  environment: KsefEnvironment;
  token: string;
  autoSend: boolean;
  nip: string;
}

export class KsefApiClient {
  private httpClient: AxiosInstance;
  private environment: KsefEnvironment;

  constructor(environment: KsefEnvironment = "test") {
    this.environment = environment;
    this.httpClient = axios.create({
      baseURL: KSEF_ENVIRONMENTS[environment].api,
      timeout: 30000,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
  }

  static async getSettings(): Promise<KsefSettings> {
    const [enabled, environment, token, autoSend, nip] = await Promise.all([
      SettingsModel.getSetting("ksef_enabled"),
      SettingsModel.getSetting("ksef_environment"),
      SettingsModel.getSetting("ksef_token"),
      SettingsModel.getSetting("ksef_auto_send"),
      SettingsModel.getSetting("ksef_nip"),
    ]);
    return {
      enabled: enabled === "true",
      environment: (environment as KsefEnvironment) || "test",
      token: token || "",
      autoSend: autoSend === "true",
      nip: nip || "",
    };
  }

  static async saveSettings(settings: Partial<KsefSettings>): Promise<void> {
    const updates: Promise<any>[] = [];
    if (settings.enabled !== undefined) {
      updates.push(SettingsModel.upsertSetting("ksef_enabled", settings.enabled.toString(), "Wlacz integracje KSeF"));
    }
    if (settings.environment !== undefined) {
      updates.push(SettingsModel.upsertSetting("ksef_environment", settings.environment, "Srodowisko KSeF"));
    }
    if (settings.token !== undefined) {
      updates.push(SettingsModel.upsertSetting("ksef_token", settings.token, "Token autoryzacyjny KSeF"));
    }
    if (settings.autoSend !== undefined) {
      updates.push(SettingsModel.upsertSetting("ksef_auto_send", settings.autoSend.toString(), "Automatyczna wysylka do KSeF"));
    }
    if (settings.nip !== undefined) {
      updates.push(SettingsModel.upsertSetting("ksef_nip", settings.nip, "NIP do autoryzacji w KSeF"));
    }
    await Promise.all(updates);
  }

  /** Step 1: POST /auth/challenge - get challenge (no body needed) */
  async getChallenge(): Promise<{ challenge: string; timestamp: string; timestampMs: number }> {
    const response = await this.httpClient.post("/auth/challenge");
    return {
      challenge: response.data.challenge,
      timestamp: response.data.timestamp,
      timestampMs: response.data.timestampMs,
    };
  }

  /** Step 2: POST /auth/ksef-token - authenticate with KSeF token */
  async initTokenAuth(ksefToken: string): Promise<{ authToken: string; referenceNumber: string }> {
    const { challenge, timestampMs } = await this.getChallenge();

    // Get MF public key for token encryption
    const publicKeyPem = await this.getPublicKey();

    // Encrypt: "token|timestampMs" with RSA-OAEP SHA-256
    const plaintext = `${ksefToken}|${timestampMs}`;
    const encrypted = crypto.publicEncrypt(
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(plaintext, "utf-8")
    );
    const encryptedBase64 = encrypted.toString("base64");

    const nip = await this.getNip();
    const response = await this.httpClient.post("/auth/ksef-token", {
      challenge,
      contextIdentifier: { type: "Nip", value: nip },
      encryptedToken: encryptedBase64,
    });

    return {
      authToken: response.data.authenticationToken.token,
      referenceNumber: response.data.referenceNumber,
    };
  }

  /** Step 3: POST /auth/token/redeem - exchange auth token for access token */
  async redeemTokens(authToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await this.httpClient.post("/auth/token/redeem", {}, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return {
      accessToken: response.data.accessToken.token,
      refreshToken: response.data.refreshToken.token,
    };
  }

  /** Step 4: POST /sessions/online - open session for sending invoices */
  async openSession(accessToken: string): Promise<KsefSession> {
    // Generate AES-256 key and IV
    const encryptionKey = crypto.randomBytes(32);
    const encryptionIV = crypto.randomBytes(16);

    // Get MF public key and encrypt symmetric key
    const publicKeyPem = await this.getPublicKey();
    const encryptedKey = crypto.publicEncrypt(
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      encryptionKey
    );

    const response = await this.httpClient.post("/sessions/online", {
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: {
        encryptedSymmetricKey: encryptedKey.toString("base64"),
        initializationVector: encryptionIV.toString("base64"),
      },
    }, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      referenceNumber: response.data.referenceNumber,
      accessToken,
      refreshToken: "",
      encryptionKey,
      encryptionIV,
    };
  }

  /** Step 5: POST /sessions/online/{ref}/invoices - send invoice */
  async sendInvoice(session: KsefSession, invoiceXml: string): Promise<KsefSendResult> {
    // Encrypt XML with AES-256-CBC
    const cipher = crypto.createCipheriv("aes-256-cbc", session.encryptionKey, session.encryptionIV);
    let encryptedBuf = cipher.update(invoiceXml, "utf-8");
    encryptedBuf = Buffer.concat([encryptedBuf, cipher.final()]);
    const encryptedBase64 = encryptedBuf.toString("base64");

    // Hashes
    const invoiceHash = crypto.createHash("sha256").update(invoiceXml, "utf-8").digest("base64");
    const encryptedInvoiceHash = crypto.createHash("sha256").update(encryptedBuf).digest("base64");

    const response = await this.httpClient.post(
      `/sessions/online/${session.referenceNumber}/invoices`,
      {
        invoiceHash,
        invoiceSize: Buffer.byteLength(invoiceXml, "utf-8"),
        encryptedInvoiceHash,
        encryptedInvoiceSize: encryptedBuf.length,
        encryptedInvoiceContent: encryptedBase64,
      },
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    );

    return {
      referenceNumber: response.data.referenceNumber,
      ksefReferenceNumber: response.data.ksefReferenceNumber,
    };
  }

  /** Step 6: POST /sessions/online/{ref}/close - close session */
  async closeSession(session: KsefSession): Promise<void> {
    await this.httpClient.post(
      `/sessions/online/${session.referenceNumber}/close`,
      {},
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    );
  }

  /** GET /sessions/{ref} - check session status and get invoices */
  async getSessionStatus(referenceNumber: string, accessToken: string): Promise<any> {
    const response = await this.httpClient.get(`/sessions/${referenceNumber}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  }

  /** GET /security/public-key-certificates - get MF public key */
  private async getPublicKey(): Promise<string> {
    const response = await this.httpClient.get("/security/public-key-certificates");
    const certs = response.data;
    if (!Array.isArray(certs) || certs.length === 0) {
      throw new Error("Brak certyfikatow klucza publicznego KSeF");
    }

    // Find valid certificate
    const now = new Date();
    const validCert = certs.find((c: any) => {
      const from = new Date(c.validFrom);
      const to = new Date(c.validTo);
      return now >= from && now <= to;
    }) || certs[0];

    // Convert DER Base64 to PEM
    const derBase64 = validCert.certificate;
    const pem = `-----BEGIN CERTIFICATE-----\n${derBase64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;

    // Extract public key from certificate
    const cert = crypto.createPublicKey({ key: Buffer.from(derBase64, "base64"), format: "der", type: "spki" });
    return cert.export({ type: "spki", format: "pem" }).toString();
  }

  /** Test connection to KSeF */
  async testConnection(): Promise<{ success: boolean; message: string; environment: string }> {
    try {
      const { challenge } = await this.getChallenge();
      return {
        success: true,
        message: `Polaczenie z KSeF OK. Challenge: ${challenge.substring(0, 20)}...`,
        environment: this.environment,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Blad polaczenia: ${error.response?.data?.message || error.response?.data?.exception?.exceptionDetailList?.[0]?.exceptionDescription || error.message}`,
        environment: this.environment,
      };
    }
  }

  private async getNip(): Promise<string> {
    const nip = await SettingsModel.getSetting("ksef_nip");
    if (!nip) {
      const companyNip = await SettingsModel.getSetting("company_nip");
      return (companyNip || "").replace(/[^0-9]/g, "");
    }
    return nip.replace(/[^0-9]/g, "");
  }
}

/** High-level: send a single invoice through full KSeF flow */
export async function sendInvoiceToKsef(invoiceXml: string): Promise<{
  success: boolean;
  referenceNumber?: string;
  ksefReferenceNumber?: string;
  error?: string;
}> {
  const settings = await KsefApiClient.getSettings();
  if (!settings.enabled) return { success: false, error: "Integracja KSeF jest wylaczona" };
  if (!settings.token) return { success: false, error: "Brak tokenu autoryzacyjnego KSeF" };

  const client = new KsefApiClient(settings.environment);

  try {
    // Authenticate
    const { authToken } = await client.initTokenAuth(settings.token);
    const { accessToken } = await client.redeemTokens(authToken);

    // Open session, send, close
    const session = await client.openSession(accessToken);
    const sendResult = await client.sendInvoice(session, invoiceXml);
    await client.closeSession(session);

    return {
      success: true,
      referenceNumber: sendResult.referenceNumber,
      ksefReferenceNumber: sendResult.ksefReferenceNumber,
    };
  } catch (error: any) {
    const detail = error.response?.data?.exception?.exceptionDetailList?.[0];
    const errorMessage = detail?.exceptionDescription || error.response?.data?.message || error.message;
    return { success: false, error: `Blad KSeF: ${errorMessage}` };
  }
}
