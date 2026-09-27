import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Response } from "@playwright/test";

const JOURNEY_ID_KEY = "reds:buyer-journey-id:v1";
const SESSION_ID_KEY = "reds:buyer-session-id:v1";

export const GOLDEN_BROWSER_REQUEST = "Найди 5 квартир для жизни.";

const journeyAction = (response: Response, action: string): boolean => {
  if (!response.url().endsWith("/api/buyer-journeys")) return false;
  try {
    return response.request().postDataJSON()?.action === action;
  } catch {
    return false;
  }
};

export const waitForJourneyAction = (
  page: Page,
  action: string,
): Promise<Response> =>
  page.waitForResponse((response) => journeyAction(response, action));

export const expectNoSeriousAccessibilityViolations = async (
  page: Page,
): Promise<void> => {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blocking = result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(
    blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
};

export const expectViewportContained = async (page: Page): Promise<void> => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
};

interface BrowserJourneySnapshot {
  readonly journey: {
    readonly journey_id: string;
    readonly current_stage: string;
  };
  readonly snapshot: {
    readonly matching_bundle: {
      readonly dataset_snapshot: { readonly dataset_type: string };
      readonly entries: readonly { readonly origin: string }[];
    } | null;
  };
}

export const readJourneySnapshot = async (
  page: Page,
): Promise<BrowserJourneySnapshot> =>
  page.evaluate(
    async ({ journeyKey, sessionKey }) => {
      const journeyId = localStorage.getItem(journeyKey);
      const sessionId = localStorage.getItem(sessionKey);
      if (!journeyId || !sessionId)
        throw new Error("Browser journey identifiers are missing");
      const response = await fetch("/api/buyer-journeys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "snapshot", journeyId, sessionId }),
      });
      if (!response.ok)
        throw new Error(`Journey snapshot failed with HTTP ${response.status}`);
      return response.json();
    },
    { journeyKey: JOURNEY_ID_KEY, sessionKey: SESSION_ID_KEY },
  );

export const assertManualCuratedPilot = (
  snapshot: BrowserJourneySnapshot,
): void => {
  const bundle = snapshot.snapshot.matching_bundle;
  expect(bundle).not.toBeNull();
  expect(bundle?.dataset_snapshot.dataset_type).toBe("manual_curated_pilot");
  expect(bundle?.entries.length).toBeGreaterThan(0);
  expect([...new Set(bundle?.entries.map((entry) => entry.origin))]).toEqual([
    "manual_curated",
  ]);
  expect(JSON.stringify(bundle).toLowerCase()).not.toContain("synthetic");
};
