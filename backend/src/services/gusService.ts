import axios from "axios";

/**
 * GUS BIR API Service - Główny Urząd Statystyczny
 * Dokumentacja: https://api.stat.gov.pl/Home/RegonApi
 */

const GUS_API_URL = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const GUS_API_KEY = "e1b2cc959798465eb114";

export interface GusCompanyData {
  nip: string;
  regon: string;
  nazwa: string;
  wojewodztwo: string;
  powiat: string;
  gmina: string;
  miejscowosc: string;
  kodPocztowy: string;
  ulica: string;
  nrNieruchomosci: string;
  nrLokalu: string;
  typ: string;
  statusNip: string;
  dataZakonczeniaDzialalnosci: string | null;
}

export interface GusLookupResult {
  nip: string;
  regon: string;
  name: string;
  street: string;
  houseNumber: string;
  apartmentNumber: string;
  city: string;
  postalCode: string;
  voivodeship: string;
  county: string;
  commune: string;
  type: string;
  isActive: boolean;
  endDate: string | null;
}

export class GusService {
  /**
   * Login to GUS API and get session ID
   */
  private static async login(): Promise<string> {
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action>
    <wsa:To>${GUS_API_URL}</wsa:To>
  </soap:Header>
  <soap:Body>
    <ns:Zaloguj>
      <ns:pKluczUzytkownika>${GUS_API_KEY}</ns:pKluczUzytkownika>
    </ns:Zaloguj>
  </soap:Body>
</soap:Envelope>`;

    const response = await axios.post(GUS_API_URL, soapEnvelope, {
      headers: {
        "Content-Type": "application/soap+xml;charset=UTF-8",
      },
      timeout: 15000,
    });

    const sidMatch = response.data.match(/<ZalogujResult>([^<]+)<\/ZalogujResult>/);
    if (!sidMatch || !sidMatch[1]) {
      throw new Error("Nie udało się zalogować do API GUS");
    }

    return sidMatch[1];
  }

  /**
   * Logout from GUS API
   */
  private static async logout(sessionId: string): Promise<void> {
    try {
      const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Wyloguj</wsa:Action>
    <wsa:To>${GUS_API_URL}</wsa:To>
  </soap:Header>
  <soap:Body>
    <ns:Wyloguj>
      <ns:pIdentyfikatorSesji>${sessionId}</ns:pIdentyfikatorSesji>
    </ns:Wyloguj>
  </soap:Body>
</soap:Envelope>`;

      await axios.post(GUS_API_URL, soapEnvelope, {
        headers: {
          "Content-Type": "application/soap+xml;charset=UTF-8",
          sid: sessionId,
        },
        timeout: 10000,
      });
    } catch (error) {
      console.error("GUS logout error:", error);
    }
  }

  /**
   * Search for company by NIP
   */
  private static async searchByNip(sessionId: string, nip: string): Promise<string> {
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty</wsa:Action>
    <wsa:To>${GUS_API_URL}</wsa:To>
  </soap:Header>
  <soap:Body>
    <ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <dat:Nip>${nip}</dat:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>
  </soap:Body>
</soap:Envelope>`;

    const response = await axios.post(GUS_API_URL, soapEnvelope, {
      headers: {
        "Content-Type": "application/soap+xml;charset=UTF-8",
        sid: sessionId,
      },
      timeout: 15000,
    });

    const resultMatch = response.data.match(/<DaneSzukajPodmiotyResult>([^]*?)<\/DaneSzukajPodmiotyResult>/);
    if (!resultMatch || !resultMatch[1]) {
      return "";
    }

    return resultMatch[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
  }

  /**
   * Parse XML response to company data
   */
  private static parseCompanyData(xml: string): GusCompanyData | null {
    if (!xml || xml.trim() === "") {
      return null;
    }

    const getValue = (tag: string): string => {
      const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return match ? match[1].trim() : "";
    };

    const nip = getValue("Nip");
    if (!nip) {
      return null;
    }

    return {
      nip: nip,
      regon: getValue("Regon"),
      nazwa: getValue("Nazwa"),
      wojewodztwo: getValue("Wojewodztwo"),
      powiat: getValue("Powiat"),
      gmina: getValue("Gmina"),
      miejscowosc: getValue("Miejscowosc"),
      kodPocztowy: getValue("KodPocztowy"),
      ulica: getValue("Ulica"),
      nrNieruchomosci: getValue("NrNieruchomosci"),
      nrLokalu: getValue("NrLokalu"),
      typ: getValue("Typ"),
      statusNip: getValue("StatusNip"),
      dataZakonczeniaDzialalnosci: getValue("DataZakonczeniaDzialalnosci") || null,
    };
  }

  /**
   * Look up company by NIP
   */
  static async lookupByNip(nip: string): Promise<GusLookupResult | null> {
    const cleanNip = nip.replace(/[-\s]/g, "");

    if (!/^\d{10}$/.test(cleanNip)) {
      throw new Error("Nieprawidłowy format NIP. Wymagane 10 cyfr.");
    }

    let sessionId: string | null = null;

    try {
      sessionId = await this.login();
      console.log("[GUS] Logged in, session:", sessionId.substring(0, 8) + "...");

      const searchResult = await this.searchByNip(sessionId, cleanNip);

      if (!searchResult) {
        console.log("[GUS] No results for NIP:", cleanNip);
        return null;
      }

      const companyData = this.parseCompanyData(searchResult);

      if (!companyData) {
        console.log("[GUS] Could not parse company data");
        return null;
      }

      console.log("[GUS] Found company:", companyData.nazwa);

      return {
        nip: companyData.nip,
        regon: companyData.regon,
        name: companyData.nazwa,
        street: companyData.ulica,
        houseNumber: companyData.nrNieruchomosci,
        apartmentNumber: companyData.nrLokalu,
        city: companyData.miejscowosc,
        postalCode: companyData.kodPocztowy,
        voivodeship: companyData.wojewodztwo,
        county: companyData.powiat,
        commune: companyData.gmina,
        type: companyData.typ === "F" ? "Osoba fizyczna" : "Osoba prawna",
        isActive: !companyData.dataZakonczeniaDzialalnosci,
        endDate: companyData.dataZakonczeniaDzialalnosci,
      };
    } catch (error: any) {
      console.error("[GUS] Error:", error.message);
      throw error;
    } finally {
      if (sessionId) {
        await this.logout(sessionId);
        console.log("[GUS] Logged out");
      }
    }
  }
}
