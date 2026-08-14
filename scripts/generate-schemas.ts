import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import * as prettier from "prettier";
import { z } from "zod";

import { topLevelSchemas } from "../src/domain/schemas";

const outputDirectory = path.resolve(process.cwd(), "data/schemas");
const checkOnly = process.argv.includes("--check");
const staleFiles: string[] = [];

await mkdir(outputDirectory, { recursive: true });

for (const definition of topLevelSchemas) {
  const generated = z.toJSONSchema(definition.schema, {
    target: "draft-2020-12",
  });
  const jsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: definition.id,
    ...generated,
  };
  const outputPath = path.join(outputDirectory, definition.file_name);
  const prettierConfig = await prettier.resolveConfig(outputPath);
  const formatted = await prettier.format(JSON.stringify(jsonSchema), {
    ...prettierConfig,
    filepath: outputPath,
  });
  const contents = formatted.endsWith("\n") ? formatted : `${formatted}\n`;

  if (checkOnly) {
    const existing = await readFile(outputPath, "utf8").catch(() => null);
    if (existing !== contents) {
      staleFiles.push(definition.file_name);
    }
  } else {
    await writeFile(outputPath, contents, "utf8");
  }
}

if (staleFiles.length > 0) {
  throw new Error(
    `Generated JSON Schemas are stale or missing: ${staleFiles.join(", ")}`,
  );
}

if (!checkOnly) {
  console.log(
    `Generated ${topLevelSchemas.length} JSON Schemas in ${outputDirectory}`,
  );
}
