import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string): string =>
  readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("TASK-025 deployment boundaries", () => {
  it("keeps the checked-in Next build dynamic and traces readiness migrations", () => {
    const config = read("next.config.ts");
    expect(config).not.toMatch(/output\s*:\s*["']export["']/);
    expect(config).toContain('"/api/readiness"');
    expect(config).toContain('"./migrations/*.up.sql"');
    expect(config).toContain('"./data/examples/real-pilot/candidates/*.json"');
  });

  it("contains the Pages export mutation inside its guarded disposable workflow", () => {
    const preparation = read("scripts/prepare-github-pages-preview.mjs");
    const workflow = read(".github/workflows/pages-preview.yml");
    expect(preparation).toContain('GITHUB_PAGES_STATIC_PREVIEW !== "1"');
    expect(preparation).toContain('output: "export"');
    expect(workflow).toContain('GITHUB_PAGES_STATIC_PREVIEW: "1"');
    expect(workflow).toContain("node scripts/prepare-github-pages-preview.mjs");
    expect(read(".github/workflows/ci.yml")).not.toContain(
      "prepare-github-pages-preview.mjs",
    );
  });

  it("pins persistence-backed application APIs to the Node.js runtime", () => {
    for (const route of [
      "app/api/buyer-journeys/route.ts",
      "app/api/expert-requests/route.ts",
      "app/api/expert-workbench/[requestId]/route.ts",
      "app/api/readiness/route.ts",
    ])
      expect(read(route), route).toContain('export const runtime = "nodejs"');
  });
});
