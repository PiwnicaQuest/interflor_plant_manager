import axios from "axios";

const ARES_API_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest";

export interface AresLookupResult {
  ico: string;
  dic?: string;
  name: string;
  street: string;
  houseNumber: string;
  apartmentNumber: string;
  city: string;
  postalCode: string;
  country: string;
}

export class AresService {
  /**
   * Lookup by ICO (8 digits)
   */
  static async lookupByIco(ico: string): Promise<AresLookupResult | null> {
    try {
      const response = await axios.get(`${ARES_API_URL}/ekonomicke-subjekty/${ico}`, {
        timeout: 15000,
        headers: { Accept: "application/json" },
      });

      const data = response.data;
      if (!data || !data.ico) return null;

      const addr = data.sidlo || {};

      return {
        ico: data.ico,
        dic: data.dic || undefined,
        name: data.obchodniJmeno || data.nazev || "",
        street: addr.nazevUlice || "",
        houseNumber: addr.cisloDomovni ? String(addr.cisloDomovni) : "",
        apartmentNumber: addr.cisloOrientacni ? String(addr.cisloOrientacni) : "",
        city: addr.nazevObce || "",
        postalCode: addr.psc ? String(addr.psc) : "",
        country: "Czechy",
      };
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      console.error("[ARES] Error:", error.message);
      throw new Error("Blad podczas wyszukiwania w ARES: " + error.message);
    }
  }

  /**
   * Search by DIC (VAT ID, format CZxxxxxxxx) - extracts ICO and uses ICO lookup
   */
  static async lookupByDic(dic: string): Promise<AresLookupResult | null> {
    // DIC format is CZ + ICO, so extract the numeric part
    const ico = dic.replace(/^CZ/i, "");
    const result = await this.lookupByIco(ico);
    return result;
  }
}
