import { defineConfig } from "@playwright/test";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for deployed browser E2E`);
  return value;
};

const deployedBaseUrl = (): string => {
  const candidate = new URL(required("BASE_URL"));
  const hostname = candidate.hostname.toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    /^127(?:\.[0-9]{1,3}){3}$/.test(hostname);
  if (
    candidate.protocol !== "https:" ||
    loopback ||
    candidate.username ||
    candidate.password ||
    candidate.search ||
    candidate.hash ||
    !["", "/"].includes(candidate.pathname)
  )
    throw new Error(
      "BASE_URL must be a deployed HTTPS origin without credentials, path, query or fragment",
    );
  return candidate.origin;
};

const baseURL = deployedBaseUrl();
required("VERCEL_AUTOMATION_BYPASS_SECRET");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  globalTimeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium-360",
      use: { viewport: { width: 360, height: 800 } },
    },
    {
      name: "chromium-768",
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "chromium-1280",
      use: { viewport: { width: 1280, height: 900 } },
    },
  ],
});
