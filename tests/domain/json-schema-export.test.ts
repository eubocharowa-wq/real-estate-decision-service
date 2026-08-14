import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { topLevelSchemas } from "../../src/domain/schemas";

describe("generated JSON Schema contracts", () => {
  it("exports every top-level runtime schema without drift", () => {
    expect(topLevelSchemas).toHaveLength(18);

    for (const definition of topLevelSchemas) {
      const outputPath = path.resolve(
        process.cwd(),
        "data/schemas",
        definition.file_name,
      );
      const checkedIn: unknown = JSON.parse(readFileSync(outputPath, "utf8"));
      const generated = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: definition.id,
        ...z.toJSONSchema(definition.schema, { target: "draft-2020-12" }),
      };

      expect(checkedIn).toEqual(generated);
      expect(checkedIn).toMatchObject({
        $id: definition.id,
        properties: {
          schema_version: { const: "1.0" },
        },
      });
    }
  });
});
