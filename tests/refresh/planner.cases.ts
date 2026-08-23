import { describe, expect, it } from "vitest";

import {
  planScheduledRefreshes,
  resolveFieldFreshness,
  type RefreshFieldCandidate,
} from "../../src/data-collection/refresh";
import { NOW, TARGET_URL } from "./helpers";

const freshnessPolicy = {
  field_pattern: "listing_price",
  volatility: "V1" as const,
  target_ttl_hours: 6,
  stale_after_hours: 24,
  critical_after_hours: 72,
  valid_until_overrides: true,
  refresh_modes: ["targeted" as const],
};

const candidate = (
  overrides: Partial<RefreshFieldCandidate> = {},
): RefreshFieldCandidate => ({
  entityType: "offer",
  entityId: "offer_fixture_101",
  sourceId: "fixture_refresh",
  targetUrl: TARGET_URL,
  fieldPath: "listing_price",
  observedAt: "2026-08-20T12:00:00.000Z",
  validUntil: null,
  verificationStatus: "confirmed",
  criticality: "important",
  conflict: "none",
  volatility: "V1",
  freshnessPolicy,
  sourceHealth: "healthy",
  userRequestPriority: "normal",
  journeyStage: "discovery",
  requestedBy: "system",
  automaticRefreshAvailable: true,
  ...overrides,
});

describe("deterministic refresh planner", () => {
  it("does not plan a fresh field and targets a stale field", () => {
    const fresh = candidate({ observedAt: "2026-08-23T10:00:00.000Z" });
    const stale = candidate();
    expect(
      planScheduledRefreshes({ now: NOW, candidates: [fresh] })[0],
    ).toMatchObject({ action: "none", reason: null });
    expect(
      planScheduledRefreshes({ now: NOW, candidates: [stale] })[0],
    ).toMatchObject({
      action: "enqueue_refresh",
      reason: "STALE_FIELD",
      request: { fieldPaths: ["listing_price"] },
    });
  });

  it("gives valid_until precedence over a generic fresh status", () => {
    const expired = candidate({
      freshnessStatus: "fresh",
      validUntil: "2026-08-23T11:59:59.000Z",
      entityType: "promotion",
      entityId: "promotion_fixture_101",
    });
    expect(resolveFieldFreshness(NOW, expired)).toBe("expired");
    expect(
      planScheduledRefreshes({ now: NOW, candidates: [expired] })[0],
    ).toMatchObject({
      action: "deactivate_or_verify",
      reason: "EXPIRED_FIELD",
    });
  });

  it("plans critical unknown and returns manual review when automation is unavailable", () => {
    const unknown = candidate({
      fieldPath: "financing.family_mortgage_applicability",
      observedAt: null,
      verificationStatus: "unknown",
      criticality: "critical",
      freshnessStatus: "unknown",
    });
    expect(
      planScheduledRefreshes({ now: NOW, candidates: [unknown] })[0],
    ).toMatchObject({ action: "enqueue_refresh", reason: "CRITICAL_UNKNOWN" });
    expect(
      planScheduledRefreshes({
        now: NOW,
        candidates: [
          candidate({
            conflict: "critical",
            automaticRefreshAvailable: false,
          }),
        ],
      })[0],
    ).toMatchObject({
      action: "manual_review_required",
      reason: "MANUAL_REVIEW_REQUEST",
      request: null,
    });
  });

  it("targets only relevant fields in pre-decision planning", () => {
    const outcomes = planScheduledRefreshes({
      now: NOW,
      mode: "pre_decision",
      candidates: [
        candidate({ fieldPath: "listing_price" }),
        candidate({
          fieldPath: "availability",
          observedAt: "2026-08-23T00:00:00.000Z",
          freshnessStatus: "aging",
        }),
        candidate({
          fieldPath: "financing.family_mortgage_applicability",
          verificationStatus: "claimed",
          freshnessStatus: "fresh",
          criticality: "critical",
        }),
      ],
    });
    expect(outcomes).toHaveLength(3);
    expect(
      outcomes.every((outcome) => outcome.reason === "PRE_DECISION_CHECK"),
    ).toBe(true);
    expect(outcomes.map((outcome) => outcome.request?.fieldPaths)).toEqual([
      ["availability"],
      ["financing.family_mortgage_applicability"],
      ["listing_price"],
    ]);
  });

  it("is deterministic and suppresses an already active dedup key", () => {
    const first = planScheduledRefreshes({
      now: NOW,
      candidates: [candidate()],
    });
    const second = planScheduledRefreshes({
      now: NOW,
      candidates: [candidate()],
    });
    expect(second).toEqual(first);
    expect(
      planScheduledRefreshes({
        now: NOW,
        candidates: [candidate()],
        activeDedupKeys: [first[0]!.dedupKey!],
      })[0],
    ).toMatchObject({ action: "none", reason: "STALE_FIELD" });
  });

  it("creates a user-requested task without bypassing later policy checks", () => {
    const outcome = planScheduledRefreshes({
      now: NOW,
      mode: "user_requested",
      candidates: [
        candidate({ freshnessStatus: "fresh", requestedBy: "user" }),
      ],
    })[0]!;
    expect(outcome).toMatchObject({
      action: "enqueue_refresh",
      reason: "USER_REQUESTED",
      request: { requestedBy: "user" },
    });
  });
});
