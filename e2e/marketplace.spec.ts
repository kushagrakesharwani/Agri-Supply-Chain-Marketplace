import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

type Role = "farmer" | "fpo" | "buyer";

type ApiObservation = {
  method: string;
  url: string;
  status: number;
  statusText: string;
  body: string;
};

const apiObservations = new WeakMap<Page, Array<Promise<ApiObservation>>>();

test.beforeEach(async ({ page }) => {
  const observations: Array<Promise<ApiObservation>> = [];
  apiObservations.set(page, observations);
  page.on("response", (response) => {
    if (!new URL(response.url()).pathname.startsWith("/api/")) return;
    observations.push(observeResponse(response));
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;

  const observations = apiObservations.get(page) ?? [];
  const [apiResponseLog, visibleUiState] = await Promise.all([
    Promise.all(observations),
    page
      .locator("body")
      .innerText()
      .catch(() => "The page closed before UI state could be captured."),
  ]);

  await testInfo.attach("api-responses", {
    body: JSON.stringify(apiResponseLog, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("visible-ui-state", {
    body: visibleUiState,
    contentType: "text/plain",
  });
});

async function observeResponse(response: Response): Promise<ApiObservation> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "<response body was unavailable>";
  }
  return {
    method: response.request().method(),
    url: response.url(),
    status: response.status(),
    statusText: response.statusText(),
    body,
  };
}

function uniqueName(label: string, suffix: string) {
  return `E2E ${label.toUpperCase()} ${suffix}`;
}

async function expectApiResponse(
  responsePromise: Promise<Response>,
  expectedStatus: number,
) {
  const response = await responsePromise;
  expect(
    response.status(),
    `${response.request().method()} ${response.url()} returned ${await response.text()}`,
  ).toBe(expectedStatus);
  return response;
}

async function createUser(page: Page, role: Role, name: string) {
  await page.goto("/login");
  await expect(page.getByTestId("form-login")).toBeVisible();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId(`button-role-${role}`).click();

  const userResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/users" &&
      response.request().method() === "POST",
  );
  await page.getByTestId("button-continue").click();
  await expectApiResponse(userResponse, 201);

  await expect(page.getByTestId("text-current-user")).toHaveText(name);
  await expect(page.getByTestId("text-current-role")).toHaveText(
    role === "fpo" ? "FPO" : role === "buyer" ? "Buyer" : "Farmer",
  );
}

async function createListing(page: Page, cropType: string) {
  await page.getByTestId("link-nav-add-produce").click();
  await expect(page.getByTestId("form-new-listing")).toBeVisible();
  await page.getByTestId("input-crop-type").fill(cropType);
  await page.getByTestId("input-quantity").fill("120");
  await page.getByTestId("input-unit").fill("kg");
  await page.getByTestId("input-price").fill("34");
  await page.getByTestId("input-location").fill("Nashik, MH");

  const listingResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/listings" &&
      response.request().method() === "POST",
  );
  await page.getByTestId("button-publish-listing").click();
  const response = await expectApiResponse(listingResponse, 201);
  const listing = (await response.json()) as { id: string };
  await expect(page).toHaveURL(new RegExp(`/listings/${listing.id}$`));
  await expect(page.getByTestId(`heading-listing-${listing.id}`)).toHaveText(
    cropType,
  );
  return listing.id;
}

async function advanceOrder(page: Page, orderId: string, nextStatus: string) {
  const updateResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/orders/${orderId}/status` &&
      response.request().method() === "PATCH",
  );
  await page.getByTestId(`button-advance-order-${orderId}`).click();
  await expectApiResponse(updateResponse, 200);
  await expect(page.getByTestId(`status-order-${nextStatus}`)).toBeVisible();
}

test("completes an isolated farmer-to-buyer marketplace journey", async ({
  browser,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const cropType = uniqueName("crop", suffix);
  const farmerContext = await browser.newContext();
  const fpoContext = await browser.newContext();
  const buyerContext = await browser.newContext();

  try {
    const farmerPage = await farmerContext.newPage();
    await createUser(farmerPage, "farmer", uniqueName("farmer", suffix));
    await expect(farmerPage).toHaveURL(/\/orders$/);
    await expect(farmerPage.getByTestId("heading-orders")).toHaveText(
      "Keep trade moving.",
    );
    const listingId = await createListing(farmerPage, cropType);
    await expect(farmerPage.getByTestId("state-seller-view")).toContainText(
      "Farmer",
    );

    const fpoPage = await fpoContext.newPage();
    await createUser(fpoPage, "fpo", uniqueName("fpo", suffix));
    await expect(fpoPage).toHaveURL(/\/orders$/);
    await expect(fpoPage.getByTestId("heading-orders")).toHaveText(
      "Keep trade moving.",
    );
    await expect(fpoPage.getByTestId("link-nav-add-produce")).toBeVisible();

    const buyerPage = await buyerContext.newPage();
    await createUser(buyerPage, "buyer", uniqueName("buyer", suffix));
    await expect(buyerPage).toHaveURL(/\/browse$/);
    await expect(buyerPage.getByTestId("heading-browse")).toHaveText(
      "Find your next harvest.",
    );

    await buyerPage.getByTestId("input-search-listings").fill(cropType);
    await buyerPage.getByTestId("input-min-price").fill("30");
    await buyerPage.getByTestId("input-max-price").fill("40");
    await expect(
      buyerPage.getByTestId(`card-listing-${listingId}`),
    ).toBeVisible();
    await expect(
      buyerPage.getByTestId(`text-price-${listingId}`),
    ).toContainText("₹34");

    await buyerPage.getByTestId(`card-listing-${listingId}`).click();
    await expect(buyerPage).toHaveURL(new RegExp(`/listings/${listingId}$`));
    await expect(
      buyerPage.getByTestId(`heading-listing-${listingId}`),
    ).toHaveText(cropType);
    await expect(
      buyerPage.getByTestId(`text-detail-available-${listingId}`),
    ).toHaveText("120 kg");

    await buyerPage.getByTestId("input-order-quantity").fill("3");
    await expect(buyerPage.getByTestId("text-order-total")).toHaveText("₹102");
    const orderResponse = buyerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/orders" &&
        response.request().method() === "POST",
    );
    await buyerPage.getByTestId("button-place-order").click();
    const order = (await expectApiResponse(orderResponse, 201).then(
      (response) => response.json(),
    )) as {
      id: string;
    };
    await expect(buyerPage.getByTestId("state-order-result")).toContainText(
      `Order ${order.id.slice(0, 8)} is placed`,
    );

    await buyerPage.getByTestId("link-nav-my-orders").click();
    await expect(buyerPage).toHaveURL(/\/orders$/);
    await expect(buyerPage.getByTestId(`row-order-${order.id}`)).toBeVisible();
    await expect(buyerPage.getByTestId("status-order-placed")).toBeVisible();

    await farmerPage.getByTestId("link-nav-trade-desk").click();
    await expect(farmerPage).toHaveURL(/\/orders$/);
    await expect(farmerPage.getByTestId(`row-order-${order.id}`)).toBeVisible();
    await expect(farmerPage.getByTestId("status-order-placed")).toBeVisible();

    await advanceOrder(farmerPage, order.id, "confirmed");
    await advanceOrder(farmerPage, order.id, "ready");
    await advanceOrder(farmerPage, order.id, "completed");
    await expect(farmerPage.getByTestId("state-order-action")).toContainText(
      `Order ${order.id.slice(0, 8)} moved to Completed.`,
    );

    await buyerPage.reload();
    await expect(buyerPage).toHaveURL(/\/orders$/);
    await expect(buyerPage.getByTestId(`row-order-${order.id}`)).toBeVisible();
    await expect(buyerPage.getByTestId("status-order-completed")).toBeVisible();
    await buyerPage.getByTestId(`row-order-${order.id}`).click();
    await expect(
      buyerPage.getByTestId(`card-order-detail-${order.id}`),
    ).toBeVisible();
    await expect(
      buyerPage
        .getByTestId(`card-order-detail-${order.id}`)
        .getByTestId("status-order-completed"),
    ).toBeVisible();
  } finally {
    await Promise.all([
      farmerContext.close(),
      fpoContext.close(),
      buyerContext.close(),
    ]);
  }
});
