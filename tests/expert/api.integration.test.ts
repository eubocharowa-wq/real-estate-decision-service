import { describe, expect, it } from "vitest";

import { POST } from "../../app/api/expert-requests/route";
import { loadPilotDataset } from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const userRequest = dataset.userRequests[0]!;
const property = dataset.properties[0]!;

const body = {
  owner: {
    owner_type: "anonymous" as const,
    owner_id: "anonymous_api_integration",
  },
  submission: {
    requestType: "information_verification" as const,
    triggerType: "financing_uncertainty" as const,
    questionCategory: "financing" as const,
    propertyIds: [property.identity.property_id],
    comparisonRef: null,
    userRequestRef: userRequest.user_request_id,
    field: "financing.family_mortgage",
    questionCode: "check_family_mortgage_api",
    documentRefs: [],
    onsite: null,
    userQuestion:
      "Подтвердите применимость семейной ипотеки для этого предложения.",
  },
  userRequest,
};

describe("TASK-016 user UI to application service integration", () => {
  it("creates, validates, routes and queues a contextual request offline", async () => {
    const response = await POST(
      new Request("http://localhost/api/expert-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const payload = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      status: "queued",
      required_specialist: "mortgage_specialist",
      created: true,
    });
    expect(payload.request_id).toEqual(expect.any(String));
  });

  it("returns the existing active request for an identical UI submission", async () => {
    const response = await POST(
      new Request("http://localhost/api/expert-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const payload = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "queued",
      required_specialist: "mortgage_specialist",
      created: false,
    });
  });
});
