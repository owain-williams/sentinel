const IG_BASE = "https://api.ig.com/gateway/deal";

export interface IGClientConfig {
  apiKey: string;
  username: string;
  password: string;
}

export interface IGSession {
  accountId: string;
  clientId: string;
}

export interface IGAccount {
  accountId: string;
  accountName: string;
  balance: { balance: number; deposit: number; profitLoss: number; available: number };
}

export interface IGPosition {
  dealId: string;
  epic: string;
  direction: string;
  size: number;
  level: number;
  stopLevel: number | null;
  limitLevel: number | null;
  profit: number;
  currency: string;
}

export interface CreatePositionParams {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopDistance?: number;
  limitDistance?: number;
  guaranteedStop?: boolean;
}

export interface DealReference {
  dealReference: string;
}

export class IGClient {
  private apiKey: string;
  private username: string;
  private password: string;
  private cst: string | null = null;
  private securityToken: string | null = null;

  constructor(config: IGClientConfig) {
    this.apiKey = config.apiKey;
    this.username = config.username;
    this.password = config.password;
  }

  isAuthenticated(): boolean {
    return this.cst !== null && this.securityToken !== null;
  }

  async login(): Promise<IGSession> {
    const response = await fetch(`${IG_BASE}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-IG-API-KEY": this.apiKey,
        Version: "3",
      },
      body: JSON.stringify({
        identifier: this.username,
        password: this.password,
      }),
    });

    if (!response.ok) {
      throw new Error("Authentication failed");
    }

    const data = (await response.json()) as Record<string, unknown>;
    this.cst = response.headers.get("CST");
    this.securityToken = response.headers.get("X-SECURITY-TOKEN");

    return {
      accountId: data.accountId as string,
      clientId: data.clientId as string,
    };
  }

  private authHeaders(): Record<string, string> {
    if (!this.cst || !this.securityToken) {
      throw new Error("Not authenticated — call login() first");
    }
    return {
      "Content-Type": "application/json",
      "X-IG-API-KEY": this.apiKey,
      CST: this.cst,
      "X-SECURITY-TOKEN": this.securityToken,
    };
  }

  async getAccounts(): Promise<IGAccount[]> {
    const response = await fetch(`${IG_BASE}/accounts`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status}`);
    const data = (await response.json()) as { accounts: IGAccount[] };
    return data.accounts;
  }

  async getPositions(): Promise<IGPosition[]> {
    const response = await fetch(`${IG_BASE}/positions`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to fetch positions: ${response.status}`);
    const data = (await response.json()) as { positions: Array<{ position: IGPosition }> };
    return data.positions.map((p) => p.position);
  }

  async createPosition(params: CreatePositionParams): Promise<DealReference> {
    const response = await fetch(`${IG_BASE}/positions/otc`, {
      method: "POST",
      headers: { ...this.authHeaders(), Version: "2" },
      body: JSON.stringify({
        epic: params.epic,
        direction: params.direction,
        size: params.size,
        orderType: "MARKET",
        currencyCode: "GBP",
        forceOpen: true,
        guaranteedStop: params.guaranteedStop ?? false,
        stopDistance: params.stopDistance ?? null,
        limitDistance: params.limitDistance ?? null,
      }),
    });
    if (!response.ok) throw new Error(`Failed to create position: ${response.status}`);
    return (await response.json()) as DealReference;
  }

  async closePosition(
    dealId: string,
    size: number,
    direction: "BUY" | "SELL",
  ): Promise<DealReference> {
    const response = await fetch(`${IG_BASE}/positions/otc`, {
      method: "POST",
      headers: { ...this.authHeaders(), Version: "1", _method: "DELETE" },
      body: JSON.stringify({
        dealId,
        size,
        direction,
        orderType: "MARKET",
      }),
    });
    if (!response.ok) throw new Error(`Failed to close position: ${response.status}`);
    return (await response.json()) as DealReference;
  }
}
