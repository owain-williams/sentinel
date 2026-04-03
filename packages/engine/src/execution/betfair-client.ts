export interface BetfairConfig {
  appKey: string;
  username: string;
  password: string;
  certPath: string;
  keyPath: string;
  baseUrl?: string;
}

export interface BetfairSession {
  token: string;
}

export interface Runner {
  selectionId: number;
  runnerName: string;
}

export interface MarketCatalogue {
  marketId: string;
  marketName: string;
  totalMatched: number;
  runners: Runner[];
}

export interface MarketFilter {
  textQuery?: string;
  eventTypeIds?: string[];
  marketIds?: string[];
}

export interface CatalogueParams {
  filter: MarketFilter;
  maxResults: number;
}

export interface MarketBook {
  marketId: string;
  status: string;
  runners: Array<{
    selectionId: number;
    lastPriceTraded: number | null;
    availableToBack: Array<{ price: number; size: number }>;
    availableToLay: Array<{ price: number; size: number }>;
  }>;
}

export interface PlaceInstruction {
  selectionId: number;
  side: "BACK" | "LAY";
  orderType: "LIMIT";
  limitOrder: { size: number; price: number };
}

export interface PlaceReport {
  status: string;
  instructionReports: Array<{
    status: string;
    betId: string;
    averagePriceMatched: number;
    sizeMatched: number;
  }>;
}

export interface AccountFunds {
  availableToBetBalance: number;
  exposure: number;
}

const CERT_LOGIN_URL = "https://identitysso-cert.betfair.com/api/certlogin";
const BETTING_URL = "https://api.betfair.com/exchange/betting/rest/v1.0";
const ACCOUNT_URL = "https://api.betfair.com/exchange/account/rest/v1.0";

export class BetfairClient {
  private config: BetfairConfig;
  private sessionToken: string | null = null;

  constructor(config: BetfairConfig) {
    this.config = config;
  }

  async login(): Promise<BetfairSession> {
    const body = new URLSearchParams({
      username: this.config.username,
      password: this.config.password,
    });

    const res = await fetch(CERT_LOGIN_URL, {
      method: "POST",
      headers: {
        "X-Application": this.config.appKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Betfair login failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { sessionToken: string; loginStatus: string };

    if (data.loginStatus !== "SUCCESS") {
      throw new Error(`Betfair login failed: ${data.loginStatus}`);
    }

    this.sessionToken = data.sessionToken;
    return { token: data.sessionToken };
  }

  private authHeaders(): Record<string, string> {
    if (!this.sessionToken) throw new Error("Not logged in — call login() first");
    return {
      "X-Application": this.config.appKey,
      "X-Authentication": this.sessionToken,
      "Content-Type": "application/json",
    };
  }

  async getAccountFunds(): Promise<AccountFunds> {
    const res = await fetch(`${ACCOUNT_URL}/getAccountFunds`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`getAccountFunds failed: HTTP ${res.status}`);
    return (await res.json()) as AccountFunds;
  }

  async placeOrders(marketId: string, instructions: PlaceInstruction[]): Promise<PlaceReport> {
    const res = await fetch(`${BETTING_URL}/placeOrders`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ marketId, instructions }),
    });
    if (!res.ok) throw new Error(`placeOrders failed: HTTP ${res.status}`);
    return (await res.json()) as PlaceReport;
  }

  async listMarketBook(marketIds: string[]): Promise<MarketBook[]> {
    const res = await fetch(`${BETTING_URL}/listMarketBook`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ marketIds, priceProjection: { priceData: ["EX_BEST_OFFERS"] } }),
    });
    if (!res.ok) throw new Error(`listMarketBook failed: HTTP ${res.status}`);
    return (await res.json()) as MarketBook[];
  }

  async listMarketCatalogue(params: CatalogueParams): Promise<MarketCatalogue[]> {
    const res = await fetch(`${BETTING_URL}/listMarketCatalogue`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`listMarketCatalogue failed: HTTP ${res.status}`);
    return (await res.json()) as MarketCatalogue[];
  }
}
