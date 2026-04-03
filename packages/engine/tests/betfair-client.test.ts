import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { BetfairClient, type BetfairConfig } from "../src/execution/betfair-client.ts";

const BASE_CONFIG: BetfairConfig = {
  appKey: "test-app-key",
  username: "testuser",
  password: "testpass",
  certPath: "/fake/cert.pem",
  keyPath: "/fake/key.pem",
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("BetfairClient", () => {
  test("login sends credentials and stores session token", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    server.use(
      http.post("https://identitysso-cert.betfair.com/api/certlogin", async ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        capturedBody = await request.text();
        return HttpResponse.json({
          sessionToken: "sess-abc-123",
          loginStatus: "SUCCESS",
        });
      }),
    );

    const client = new BetfairClient(BASE_CONFIG);
    const session = await client.login();

    expect(session.token).toBe("sess-abc-123");
    expect(capturedHeaders["x-application"]).toBe("test-app-key");
    expect(capturedBody).toContain("username=testuser");
    expect(capturedBody).toContain("password=testpass");
  });

  test("listMarketCatalogue returns markets matching filter", async () => {
    server.use(
      http.post("https://identitysso-cert.betfair.com/api/certlogin", () =>
        HttpResponse.json({ sessionToken: "sess-abc-123", loginStatus: "SUCCESS" }),
      ),
      http.post(
        "https://api.betfair.com/exchange/betting/rest/v1.0/listMarketCatalogue",
        async ({ request }) => {
          const headers = Object.fromEntries(request.headers.entries());
          expect(headers["x-authentication"]).toBe("sess-abc-123");
          expect(headers["x-application"]).toBe("test-app-key");

          return HttpResponse.json([
            {
              marketId: "1.234567",
              marketName: "Next UK Prime Minister",
              totalMatched: 50000,
              runners: [
                { selectionId: 111, runnerName: "Candidate A" },
                { selectionId: 222, runnerName: "Candidate B" },
              ],
            },
          ]);
        },
      ),
    );

    const client = new BetfairClient(BASE_CONFIG);
    await client.login();

    const markets = await client.listMarketCatalogue({
      filter: { textQuery: "Prime Minister" },
      maxResults: 10,
    });

    expect(markets).toHaveLength(1);
    expect(markets[0].marketId).toBe("1.234567");
    expect(markets[0].marketName).toBe("Next UK Prime Minister");
    expect(markets[0].runners).toHaveLength(2);
  });

  test("listMarketBook returns prices and runner depth", async () => {
    server.use(
      http.post("https://identitysso-cert.betfair.com/api/certlogin", () =>
        HttpResponse.json({ sessionToken: "sess-abc-123", loginStatus: "SUCCESS" }),
      ),
      http.post("https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook", () =>
        HttpResponse.json([
          {
            marketId: "1.234567",
            status: "OPEN",
            runners: [
              {
                selectionId: 111,
                lastPriceTraded: 2.5,
                availableToBack: [{ price: 2.48, size: 100 }],
                availableToLay: [{ price: 2.52, size: 80 }],
              },
            ],
          },
        ]),
      ),
    );

    const client = new BetfairClient(BASE_CONFIG);
    await client.login();

    const books = await client.listMarketBook(["1.234567"]);

    expect(books).toHaveLength(1);
    expect(books[0].status).toBe("OPEN");
    expect(books[0].runners[0].lastPriceTraded).toBe(2.5);
    expect(books[0].runners[0].availableToBack[0].price).toBe(2.48);
  });

  test("placeOrders sends bet instructions and returns confirmation", async () => {
    let capturedBody: unknown;

    server.use(
      http.post("https://identitysso-cert.betfair.com/api/certlogin", () =>
        HttpResponse.json({ sessionToken: "sess-abc-123", loginStatus: "SUCCESS" }),
      ),
      http.post(
        "https://api.betfair.com/exchange/betting/rest/v1.0/placeOrders",
        async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            status: "SUCCESS",
            instructionReports: [
              {
                status: "SUCCESS",
                betId: "bet-001",
                averagePriceMatched: 2.5,
                sizeMatched: 10,
              },
            ],
          });
        },
      ),
    );

    const client = new BetfairClient(BASE_CONFIG);
    await client.login();

    const report = await client.placeOrders("1.234567", [
      {
        selectionId: 111,
        side: "BACK",
        orderType: "LIMIT",
        limitOrder: { size: 10, price: 2.5 },
      },
    ]);

    expect(report.status).toBe("SUCCESS");
    expect(report.instructionReports[0].betId).toBe("bet-001");
    expect(report.instructionReports[0].sizeMatched).toBe(10);
    expect((capturedBody as Record<string, unknown>).marketId).toBe("1.234567");
  });

  test("getAccountFunds returns available balance and exposure", async () => {
    server.use(
      http.post("https://identitysso-cert.betfair.com/api/certlogin", () =>
        HttpResponse.json({ sessionToken: "sess-abc-123", loginStatus: "SUCCESS" }),
      ),
      http.post("https://api.betfair.com/exchange/account/rest/v1.0/getAccountFunds", () =>
        HttpResponse.json({
          availableToBetBalance: 1500.5,
          exposure: -200.0,
        }),
      ),
    );

    const client = new BetfairClient(BASE_CONFIG);
    await client.login();

    const funds = await client.getAccountFunds();

    expect(funds.availableToBetBalance).toBe(1500.5);
    expect(funds.exposure).toBe(-200.0);
  });

  test("login throws on invalid credentials", async () => {
    server.use(
      http.post("https://identitysso-cert.betfair.com/api/certlogin", () =>
        HttpResponse.json({
          sessionToken: "",
          loginStatus: "INVALID_USERNAME_OR_PASSWORD",
        }),
      ),
    );

    const client = new BetfairClient(BASE_CONFIG);

    await expect(client.login()).rejects.toThrow("INVALID_USERNAME_OR_PASSWORD");
  });

  test("reuses session token across multiple API calls", async () => {
    let loginCount = 0;

    server.use(
      http.post("https://identitysso-cert.betfair.com/api/certlogin", () => {
        loginCount++;
        return HttpResponse.json({ sessionToken: "sess-reuse", loginStatus: "SUCCESS" });
      }),
      http.post("https://api.betfair.com/exchange/betting/rest/v1.0/listMarketCatalogue", () =>
        HttpResponse.json([]),
      ),
      http.post("https://api.betfair.com/exchange/account/rest/v1.0/getAccountFunds", () =>
        HttpResponse.json({ availableToBetBalance: 100, exposure: 0 }),
      ),
    );

    const client = new BetfairClient(BASE_CONFIG);
    await client.login();

    // Make two different API calls — should not trigger another login
    await client.listMarketCatalogue({ filter: {}, maxResults: 1 });
    await client.getAccountFunds();

    expect(loginCount).toBe(1);
  });
});
