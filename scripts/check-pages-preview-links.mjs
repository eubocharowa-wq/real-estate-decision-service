import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Fails the GitHub Pages static-export build when a page links to a route
 * the export does not actually contain — the honesty guarantee TASK-024B
 * asks for. scripts/prepare-github-pages-preview.mjs deletes several
 * server-only route directories before the export builds; this walks the
 * built `out/` and confirms every internal `<a href>` still resolves to a
 * real file, rather than trusting that whoever edited the nav also updated
 * the deletion list.
 */
const OUT_DIR = path.resolve(process.cwd(), "out");
const BASE_PATH = "/real-estate-decision-service";

const HREF_PATTERN = /<a\b[^>]*\bhref="([^"]*)"/gi;

const listHtmlFiles = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(full);
    return entry.isFile() && entry.name.endsWith(".html") ? [full] : [];
  });
};

const isExternalOrNonNavigable = (href) =>
  href === "" ||
  href.startsWith("#") ||
  href.startsWith("mailto:") ||
  href.startsWith("tel:") ||
  href.startsWith("//") ||
  /^[a-z][a-z0-9+.-]*:/i.test(href);

/** Resolves an href from the export to the file it must exist as under out/. */
const resolveToFile = (href) => {
  const withoutHash = href.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  const withoutBase = withoutQuery.startsWith(BASE_PATH)
    ? withoutQuery.slice(BASE_PATH.length)
    : withoutQuery;
  const pathname = withoutBase === "" ? "/" : withoutBase;

  // A static file reference (sitemap.xml, robots.txt, an asset) resolves
  // directly; anything else is a route and, with trailingSlash: true, is
  // exported as <route>/index.html.
  if (path.extname(pathname) !== "") return path.join(OUT_DIR, pathname);
  const trimmed = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path.join(OUT_DIR, trimmed, "index.html");
};

if (!existsSync(OUT_DIR) || !statSync(OUT_DIR).isDirectory()) {
  console.error(`Expected a built static export at ${OUT_DIR}`);
  process.exit(1);
}

const htmlFiles = listHtmlFiles(OUT_DIR);
if (htmlFiles.length === 0) {
  console.error(`No .html files found under ${OUT_DIR} — build looks empty.`);
  process.exit(1);
}

const broken = [];
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(HREF_PATTERN)) {
    const href = match[1];
    if (isExternalOrNonNavigable(href)) continue;
    if (!href.startsWith("/")) continue; // relative to the current page; not a route we track here
    const target = resolveToFile(href);
    if (!existsSync(target)) {
      broken.push({
        source: path.relative(OUT_DIR, file),
        href,
        expected: path.relative(OUT_DIR, target),
      });
    }
  }
}

if (broken.length > 0) {
  console.error(
    `Found ${broken.length} internal link(s) pointing at a route the static export does not contain:\n`,
  );
  for (const item of broken)
    console.error(
      `  ${item.source} -> href="${item.href}" (expected ${item.expected})`,
    );
  console.error(
    "\nEither restore the route, or stop linking to it from the pages that survive scripts/prepare-github-pages-preview.mjs.",
  );
  process.exit(1);
}

console.log(
  `Checked ${htmlFiles.length} exported page(s): every internal link resolves.`,
);
