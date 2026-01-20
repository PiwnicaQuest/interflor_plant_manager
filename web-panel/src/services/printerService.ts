import qz from 'qz-tray';

// QZ Tray Certificate for POLFLOR
const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDaTCCAlGgAwIBAgIUD1D0zbhs6Ryi80I4l6J14iQRUmMwDQYJKoZIhvcNAQEL
BQAwRDEYMBYGA1UEAwwPUE9MRkxPUiBRWiBUcmF5MRswGQYDVQQKDBJQT0xGTE9S
IFNwLiB6IG8uby4xCzAJBgNVBAYTAlBMMB4XDTI2MDExOTIwMjAzNFoXDTM2MDEx
NzIwMjAzNFowRDEYMBYGA1UEAwwPUE9MRkxPUiBRWiBUcmF5MRswGQYDVQQKDBJQ
T0xGTE9SIFNwLiB6IG8uby4xCzAJBgNVBAYTAlBMMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAnHvGehIYsh/PwDu4G6Lqgb7Y6q461KwAjgFLnLNYY42x
MpBUSrimcj8r6nmb8e0iiqSZRfvv397tFNu+frgAV60pLqDLStU2sYOus7QLzxjk
JRtZUYVTOVpE9Asmc1O7Ya7zQs3pWstj1LW6CP8O3m37FO6FhuefDa/hqV+Fk//f
zfHK60jQ5EDFirZty6+tPzPETovsaA9uLVkaebmSTOheLY7FBp+ZTEXLEP1AWOMF
W0+87ol4pOSlaVaEFc7j3rMdd10zvZljX9LcFlpVLysczeCNFWBD6kdmWI9JGwTV
frlZ8iufUk7Ah+W9uJ4kqZktvi/Fx+IC3/HmjWznxwIDAQABo1MwUTAdBgNVHQ4E
FgQUP9F+bB/75DbkcVrmCYJWKQD2SF0wHwYDVR0jBBgwFoAUP9F+bB/75DbkcVrm
CYJWKQD2SF0wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAZ/bg
axa3L98O7r8TVFEMrDtEYigaEKueTOw0SjindgoeOMUfdW8+XPxg6LIGu3LQgIi9
ZGvKG6uDzTcjVycEXCsnR+ujXSdcU9IPhCH+DUV+aT+BIWVi7mpML+hgl8LBXULm
3yxfPkI61TQS9sAbZbbm9/OJqgd+9q8EJ/tq9hAbNpwy1E1P1vSnwlseiLVjuoMh
tiQiRkWiX9/bQJWo2uSJ+egZAQdh0jH+VuRf1rTnoKm/7u3XZruCpOQc55Rg4kPl
7lTyC1FGjsYRvb8ax6djkjpd/8DP/YSRewAZxFPjjTGhKRvSjhtLnpjTpnS6AGEH
MRxYLg9lqSyQmlwCLQ==
-----END CERTIFICATE-----`;

// QZ Tray Private Key for signing
const QZ_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCce8Z6EhiyH8/A
O7gbouqBvtjqrjrUrACOAUucs1hjjbEykFRKuKZyPyvqeZvx7SKKpJlF++/f3u0U
275+uABXrSkuoMtK1Taxg66ztAvPGOQlG1lRhVM5WkT0CyZzU7thrvNCzelay2PU
tboI/w7ebfsU7oWG558Nr+GpX4WT/9/N8crrSNDkQMWKtm3Lr60/M8ROi+xoD24t
WRp5uZJM6F4tjsUGn5lMRcsQ/UBY4wVbT7zuiXik5KVpVoQVzuPesx13XTO9mWNf
0twWWlUvKxzN4I0VYEPqR2ZYj0kbBNV+uVnyK59STsCH5b24niSpmS2+L8XH4gLf
8eaNbOfHAgMBAAECggEADv4q95IuoeO7YiXhT2s4wG1P1428SZkgmnp+9fNsXL7R
g1CMdaD4eEobg+Uv7v+InN5avcz+4CUPSRLUJHcDuA15ZyQf0OUvJCtDkf3brcrV
km/q4GJ/pVHuo6/tI1qalv2OBXtjctVkP21D9vhdF9b+GgolFVZcM7xYyNjD8c3e
rjH3fTQwMmBUibIQM6bnIwqbmsiPgUxmhPCOOlhFp3yqOLvlwqjnCPKIvY5slRiU
rP+rdIHdIVGZasbzahx/M5nZx1/mdB09ax9u9OqpZUt7SNE4QSyyqKQMTO2Itwgi
tgoBNYqOJZugcNUzKOPYqqeFDqwbVnUvZNsgTIei7QKBgQDVPfY2A42uYA6rFGid
uGs73GKYbju7wg/d0lCbg7UMN2k7NJZi5IxeJleYvV+x+CG66NMZu5QUERTuzjRz
4YHq34Tb3JJRveALC/Z1mPTRbpf4eacFgpzoaPDsjxrOPkeCrm7Fl4fl9/x2aHcE
/tvkfK9jd35UAqlNTrJDrfYuowKBgQC73E+wXQulQWntbJHHtyoL26fIvgMqCu15
8g/HtIAtrYVRfPbXUsnPdgURSusBl6iPRuIUz3CyAxb/EovVI9cRQDTPvvfmTK6+
WkgK9glCqIhM/BEYvrw3R/WkqES0n55CuQzyKBTB3Dka/p7nqVlF6Q0bxhlDn4rk
vH2pO8FojQKBgQCx8E1mjxqH+rHiwln12nDo96LybXG84FfbEueejY3jDs3p0Jz5
Epuq6LXJx6R13odO739QBr2u7P4Zs8oDNJbzhebYjDswqI+uyCG1yZfoty9q8SCV
MYN7UC5SR6vnlAKaIrJegW6uUHvD1rISYhTdmcnE525r7fiWgOeyIBTAnwKBgQCN
L4hcfbFQ45aer2fodwoMm2q//b4XDNtpOLkPV+K1caGumoJRVZECcCpi0rFIIxi1
hYpIJZcG0jeoP+IDr8nk1yJZt6ZL2PnDacqXIk3XYR3+7bpTpJWD3nsI4sWwEf45
GyZVoDXpdH8egJogdS/40KvfYcR/BBq4yciPNa+nyQKBgG2NKL4Fdr9pd9hIJGyt
LgajV9D7EIuD7/1oG50fhIrYswsMWx4Ty1df3adbTCTl/cq752Y4h0VAO5PMMiCo
lqIZfuFlg0SUBHtJY6XqkZ1DMuifqBEfD4e7b4ApbKAhWHZZSapc2GU+/WFHeCak
sSUzwL5QrKjM5wBJS/oyFOmF
-----END PRIVATE KEY-----`;

interface PrintData {
  type: 'html' | 'pixel' | 'raw';
  format: 'plain' | 'html' | 'pdf' | 'image';
  data: string;
}

// Typy dokumentów do druku
export type DocumentType =
  | 'order'           // Zamówienie
  | 'invoice'         // Faktura
  | 'receipt'         // Paragon
  | 'receipt-a4'      // Paragon A4
  | 'proforma'        // Proforma
  | 'correction'      // Korekta
  | 'label';          // Etykieta

// Konfiguracja mapowania drukarek
export interface PrinterMapping {
  documentType: DocumentType;
  printerName: string;
  enabled: boolean;
}

// Konfiguracja drukarki
export interface PrinterConfig {
  mappings: PrinterMapping[];
  defaultPrinter: string | null;
  autoConnect: boolean;
}

const STORAGE_KEY = 'printer_config';

// Domyślna konfiguracja
const defaultConfig: PrinterConfig = {
  mappings: [],
  defaultPrinter: null,
  autoConnect: true,
};

// Etykiety dla typów dokumentów
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  'order': 'Zamówienie',
  'invoice': 'Faktura',
  'receipt': 'Paragon (termiczny)',
  'receipt-a4': 'Paragon A4',
  'proforma': 'Proforma',
  'correction': 'Korekta',
  'label': 'Etykieta',
};

class PrinterService {
  private connected: boolean = false;
  private connecting: boolean = false;
  private config: PrinterConfig = defaultConfig;
  private availablePrinters: string[] = [];
  private connectionPromise: Promise<void> | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadConfig();
  }

  // Subskrybuj zmiany
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  // Załaduj konfigurację z localStorage
  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.config = { ...defaultConfig, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Error loading printer config:', e);
    }
  }

  // Zapisz konfigurację do localStorage
  saveConfig(config: Partial<PrinterConfig>): void {
    this.config = { ...this.config, ...config };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    this.notifyListeners();
  }

  // Pobierz aktualną konfigurację
  getConfig(): PrinterConfig {
    return { ...this.config };
  }

  // Sprawdź czy QZ Tray jest zainstalowany
  async isQzInstalled(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  // Połącz z QZ Tray
  async connect(): Promise<void> {
    if (this.connected && qz.websocket.isActive()) return;

    if (this.connecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connecting = true;
    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        // Konfiguracja certyfikatu POLFLOR
        qz.security.setCertificatePromise((resolve) => {
          resolve(QZ_CERTIFICATE);
        });

        // Podpisywanie żądań kluczem prywatnym używając Web Crypto API
        qz.security.setSignaturePromise((toSign: string) => {
          return async (resolve: (signature: string) => void) => {
            try {
              // Konwertuj PEM do formatu używanego przez Web Crypto
              const pemHeader = '-----BEGIN PRIVATE KEY-----';
              const pemFooter = '-----END PRIVATE KEY-----';
              const pemContents = QZ_PRIVATE_KEY
                .replace(pemHeader, '')
                .replace(pemFooter, '')
                .replace(/\n/g, '').replace(/\r/g, '');
              
              const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
              
              // Importuj klucz
              const cryptoKey = await crypto.subtle.importKey(
                'pkcs8',
                binaryDer,
                {
                  name: 'RSASSA-PKCS1-v1_5',
                  hash: 'SHA-256',
                },
                false,
                ['sign']
              );
              
              // Podpisz dane
              const encoder = new TextEncoder();
              const data = encoder.encode(toSign);
              const signature = await crypto.subtle.sign(
                'RSASSA-PKCS1-v1_5',
                cryptoKey,
                data
              );
              
              // Konwertuj do base64
              const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
              resolve(base64);
            } catch (err) {
              console.error('QZ signature error:', err);
              resolve('');
            }
          };
        });

        await qz.websocket.connect();
        this.connected = true;
        this.connecting = false;

        // Pobierz listę drukarek
        await this.refreshPrinters();
        this.notifyListeners();

        resolve();
      } catch (err) {
        this.connecting = false;
        this.connected = false;
        reject(err);
      }
    });

    return this.connectionPromise;
  }

  // Rozłącz z QZ Tray
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await qz.websocket.disconnect();
      this.connected = false;
      this.notifyListeners();
    } catch (err) {
      console.error('Error disconnecting from QZ Tray:', err);
    }
  }

  // Sprawdź status połączenia
  isConnected(): boolean {
    return this.connected && qz.websocket.isActive();
  }

  // Odśwież listę drukarek
  async refreshPrinters(): Promise<string[]> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      this.availablePrinters = await qz.printers.find();
      this.notifyListeners();
      return this.availablePrinters;
    } catch (err) {
      console.error('Error fetching printers:', err);
      return [];
    }
  }

  // Pobierz listę dostępnych drukarek
  getAvailablePrinters(): string[] {
    return [...this.availablePrinters];
  }

  // Pobierz drukarkę dla danego typu dokumentu
  getPrinterForDocument(documentType: DocumentType): string | null {
    const mapping = this.config.mappings.find(
      m => m.documentType === documentType && m.enabled
    );
    return mapping?.printerName || this.config.defaultPrinter;
  }

  // Sprawdź czy dokument ma skonfigurowaną drukarkę
  hasPrinterConfigured(documentType: DocumentType): boolean {
    return this.getPrinterForDocument(documentType) !== null;
  }

  // Ustaw mapowanie drukarki
  setMapping(documentType: DocumentType, printerName: string, enabled: boolean = true): void {
    const existingIndex = this.config.mappings.findIndex(m => m.documentType === documentType);

    if (existingIndex >= 0) {
      this.config.mappings[existingIndex] = { documentType, printerName, enabled };
    } else {
      this.config.mappings.push({ documentType, printerName, enabled });
    }

    this.saveConfig({ mappings: this.config.mappings });
  }

  // Usuń mapowanie
  removeMapping(documentType: DocumentType): void {
    this.config.mappings = this.config.mappings.filter(m => m.documentType !== documentType);
    this.saveConfig({ mappings: this.config.mappings });
  }

  // Ustaw domyślną drukarkę
  setDefaultPrinter(printerName: string | null): void {
    this.saveConfig({ defaultPrinter: printerName });
  }

  // Drukuj HTML na określonej drukarce
  async printHtml(html: string, documentType: DocumentType, options?: {
    copies?: number;
    colorType?: 'color' | 'grayscale' | 'blackwhite';
    duplex?: boolean;
    orientation?: 'portrait' | 'landscape';
    margins?: { top: number; right: number; bottom: number; left: number };
  }): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }

      const printerName = this.getPrinterForDocument(documentType);
      if (!printerName) {
        console.warn(`No printer configured for document type: ${documentType}`);
        return false;
      }

      const config = qz.configs.create(printerName, {
        copies: options?.copies || 1,
        colorType: options?.colorType || 'grayscale',
        duplex: options?.duplex || false,
        orientation: options?.orientation || 'portrait',
        margins: options?.margins || { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
        units: 'cm',
      });

      const data: PrintData[] = [{
        type: 'html',
        format: 'plain',
        data: html,
      }];

      await qz.print(config, data);
      return true;
    } catch (err) {
      console.error('QZ Tray print error:', err);
      return false;
    }
  }

  // Drukuj aktualną stronę
  async printCurrentPage(documentType: DocumentType): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }

      const printerName = this.getPrinterForDocument(documentType);
      if (!printerName) {
        return false;
      }

      const config = qz.configs.create(printerName, {
        colorType: 'grayscale',
        orientation: 'portrait',
        margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
        units: 'cm',
      });

      // Pobierz HTML strony
      const html = document.documentElement.outerHTML;

      const data: PrintData[] = [{
        type: 'html',
        format: 'plain',
        data: html,
      }];

      await qz.print(config, data);
      return true;
    } catch (err) {
      console.error('QZ Tray print error:', err);
      return false;
    }
  }

  // Drukuj z elementu DOM
  async printElement(element: HTMLElement, documentType: DocumentType): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }

      const printerName = this.getPrinterForDocument(documentType);
      if (!printerName) {
        return false;
      }

      const config = qz.configs.create(printerName, {
        colorType: 'grayscale',
        orientation: 'portrait',
        margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
        units: 'cm',
        scaleContent: true,
      });

      const data: PrintData[] = [{
        type: 'html',
        format: 'plain',
        data: element.outerHTML,
      }];

      await qz.print(config, data);
      return true;
    } catch (err) {
      console.error('QZ Tray print error:', err);
      return false;
    }
  }

  // Drukuj PDF
  async printPdf(pdfData: string | ArrayBuffer, documentType: DocumentType): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }

      const printerName = this.getPrinterForDocument(documentType);
      if (!printerName) {
        return false;
      }

      const config = qz.configs.create(printerName);

      const base64 = typeof pdfData === 'string'
        ? pdfData
        : btoa(String.fromCharCode(...new Uint8Array(pdfData)));

      const data: PrintData[] = [{
        type: 'pixel',
        format: 'pdf',
        data: base64,
      }];

      await qz.print(config, data);
      return true;
    } catch (err) {
      console.error('QZ Tray PDF print error:', err);
      return false;
    }
  }

  // Drukuj RAW (dla drukarek termicznych - ESC/POS)
  async printRaw(rawData: string, documentType: DocumentType): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }

      const printerName = this.getPrinterForDocument(documentType);
      if (!printerName) {
        return false;
      }

      const config = qz.configs.create(printerName);

      const data: PrintData[] = [{
        type: 'raw',
        format: 'plain',
        data: rawData,
      }];

      await qz.print(config, data);
      return true;
    } catch (err) {
      console.error('QZ Tray RAW print error:', err);
      return false;
    }
  }
}

// Singleton
export const printerService = new PrinterService();
