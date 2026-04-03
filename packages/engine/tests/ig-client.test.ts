import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { IGClient } from "../src/execution/ig-client.ts";

const IG_BASE = "https://api.ig.com/gateway/deal";

let capturedHeaders: Record<string, string> = {};

const handlers = [
  http.post(`${IG_BASE}/session`, async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    if (body.identifier === "testuser" && body.password === "testpass") {
      return HttpResponse.json(
        {
          accountId: "ABC123",
          clientId: "CLIENT1",
          timezoneOffset: 0,
          lightstreamerEndpoint: "https://push.lightstreamer.com",
          oauthToken: {
            access_token: "access-token-123",
            refresh_token: "refresh-token-456",
            scope: "profile",
            token_type: "Bearer",
            expires_in: "60",
          },
        },
        {
          headers: {
            CST: "cst-token-abc",
            "X-SECURITY-TOKEN": "security-token-xyz",
          },
        },
      );
    }
    return HttpResponse.json({ errorCode: "error.security.invalid-details" }, { status: 401 });
  }),
  http.get(`${IG_BASE}/accounts`, ({ request }) => {
    capturedHeaders = Object.fromEntries(request.headers.entries());
    return HttpResponse.json({
      accounts: [
        {
          accountId: "ABC123",
          accountName: "Spread Bet",
          balance: { balance: 5000, deposit: 200, profitLoss: 150, available: 4800 },
        },
      ],
    });
  }),
  http.get(`${IG_BASE}/positions`, () => {
    return HttpResponse.json({
      positions: [
        {
          position: {
            dealId: "DEAL001",
            epic: "IX.D.FTSE.DAILY.IP",
            direction: "BUY",
            size: 1,
            level: 7500,
            stopLevel: 7450,
            limitLevel: 7600,
            profit: 25,
            currency: "GBP",
          },
        },
      ],
    });
  }),
];

const server = setupServer(...handlers);

describe("IGClient", () => {
  let client: IGClient;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(() => {
    client = new IGClient({
      apiKey: "test-api-key",
      username: "testuser",
      password: "testpass",
    });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  test("login stores session tokens and returns account info", async () => {
    const session = await client.login();

    expect(session.accountId).toBe("ABC123");
    expect(client.isAuthenticated()).toBe(true);
  });

  test("login throws on invalid credentials", async () => {
    const badClient = new IGClient({
      apiKey: "test-api-key",
      username: "wrong",
      password: "wrong",
    });

    await expect(badClient.login()).rejects.toThrow("Authentication failed");
  });

  test("getAccounts returns account balances with auth headers", async () => {
    await client.login();
    const accounts = await client.getAccounts();

    expect(accounts).toHaveLength(1);
    expect(accounts[0].accountId).toBe("ABC123");
    expect(accounts[0].balance.balance).toBe(5000);
    expect(accounts[0].balance.available).toBe(4800);

    // Verify auth headers were sent
    expect(capturedHeaders["cst"]).toBe("cst-token-abc");
    expect(capturedHeaders["x-security-token"]).toBe("security-token-xyz");
    expect(capturedHeaders["x-ig-api-key"]).toBe("test-api-key");
  });

  test("getPositions returns open positions", async () => {
    await client.login();
    const positions = await client.getPositions();

    expect(positions).toHaveLength(1);
    expect(positions[0].dealId).toBe("DEAL001");
    expect(positions[0].epic).toBe("IX.D.FTSE.DAILY.IP");
    expect(positions[0].direction).toBe("BUY");
    expect(positions[0].profit).toBe(25);
  });

  test("getAccounts throws when not authenticated", async () => {
    await expect(client.getAccounts()).rejects.toThrow("Not authenticated");
  });

  test("createPosition sends correct payload and returns deal reference", async () => {
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post(`${IG_BASE}/positions/otc`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ dealReference: "REF-001" });
      }),
    );

    await client.login();
    const result = await client.createPosition({
      epic: "EN.D.LCO.Month1.IP",
      direction: "BUY",
      size: 2,
      stopDistance: 50,
      limitDistance: 100,
    });

    expect(result.dealReference).toBe("REF-001");
    expect(capturedBody.epic).toBe("EN.D.LCO.Month1.IP");
    expect(capturedBody.direction).toBe("BUY");
    expect(capturedBody.size).toBe(2);
    expect(capturedBody.stopDistance).toBe(50);
    expect(capturedBody.limitDistance).toBe(100);
    expect(capturedBody.orderType).toBe("MARKET");
    expect(capturedBody.currencyCode).toBe("GBP");
  });

  test("closePosition sends deal ID and returns reference", async () => {
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post(`${IG_BASE}/positions/otc`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ dealReference: "REF-CLOSE-001" });
      }),
    );

    await client.login();
    const result = await client.closePosition("DEAL001", 1, "SELL");

    expect(result.dealReference).toBe("REF-CLOSE-001");
    expect(capturedBody.dealId).toBe("DEAL001");
    expect(capturedBody.size).toBe(1);
    expect(capturedBody.direction).toBe("SELL");
  });
});
