import { expect, test as base } from "@playwright/test";

const VERCEL_BYPASS_COOKIE = "_vercel_jwt";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for browser E2E`);
  return value;
};

const safeLocation = (
  location: string | undefined,
  baseURL: string,
): { readonly host: string | null; readonly path: string | null } => {
  if (!location) return { host: null, path: null };
  const parsed = new URL(location, baseURL);
  return { host: parsed.host, path: parsed.pathname };
};

export const test = base.extend({
  page: async ({ baseURL, context, page }, provide, testInfo) => {
    const configuredBaseUrl = required("BASE_URL");
    const configuredOrigin = new URL(configuredBaseUrl).origin;
    if (!baseURL || new URL(baseURL).origin !== configuredOrigin)
      throw new Error(
        "Playwright baseURL does not match the validated BASE_URL",
      );

    const bypassSecret = required("VERCEL_AUTOMATION_BYPASS_SECRET");
    const bootstrapResponse = await context.request.get(configuredBaseUrl, {
      headers: {
        "x-vercel-protection-bypass": bypassSecret,
        "x-vercel-set-bypass-cookie": "true",
      },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const status = bootstrapResponse.status();
    const responseHeaders = bootstrapResponse.headers();
    const location = safeLocation(responseHeaders.location, configuredBaseUrl);
    const setCookiePresent = bootstrapResponse
      .headersArray()
      .some(({ name }) => name.toLowerCase() === "set-cookie");
    const bootstrapCookies = await context.cookies(configuredOrigin);
    const bypassCookiePresent = bootstrapCookies.some(
      ({ name }) => name === VERCEL_BYPASS_COOKIE,
    );
    const diagnostics = {
      status,
      location_host: location.host,
      location_path: location.path,
      set_cookie_present: setCookiePresent,
      bypass_cookie_present: bypassCookiePresent,
    };
    console.info(`[vercel-auth-bootstrap] ${JSON.stringify(diagnostics)}`);
    await testInfo.attach("vercel-auth-bootstrap.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });

    const acceptedStatus = status >= 200 && status < 400;
    if (!acceptedStatus)
      throw new Error(`Vercel auth bootstrap returned HTTP ${status}`);
    if (!bypassCookiePresent)
      throw new Error("Vercel bypass cookie is missing after auth bootstrap");

    const applicationResponse = await page.goto(configuredBaseUrl, {
      waitUntil: "domcontentloaded",
    });
    const finalUrl = new URL(page.url());
    if (finalUrl.origin !== configuredOrigin)
      throw new Error(
        `Vercel auth bootstrap ended on a disallowed origin: ${finalUrl.host}`,
      );
    if (
      finalUrl.hostname === "vercel.com" ||
      finalUrl.hostname.endsWith(".vercel.com") ||
      finalUrl.pathname.startsWith("/sso-api")
    )
      throw new Error("Browser remains on Vercel login/SSO");
    if (!applicationResponse || applicationResponse.status() >= 400)
      throw new Error("Application did not open after Vercel auth bootstrap");

    const applicationCookies = await context.cookies(configuredOrigin);
    if (!applicationCookies.some(({ name }) => name === VERCEL_BYPASS_COOKIE))
      throw new Error("Vercel bypass cookie is missing after application open");
    await page.locator("main").waitFor({ state: "visible" });

    await provide(page);
  },
});

export { expect };
