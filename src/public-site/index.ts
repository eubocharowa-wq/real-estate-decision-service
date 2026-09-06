/**
 * Public site addressing.
 *
 * The canonical origin is supplied by the operator through
 * NEXT_PUBLIC_SITE_URL. It is deliberately not defaulted: emitting a sitemap,
 * a robots reference or a metadataBase that points at a domain nobody owns is
 * worse than emitting nothing, so every consumer degrades to "no absolute
 * URLs" when the variable is missing or malformed.
 */

/** Routes served by the (public) group and safe for search engines. */
export const PUBLIC_ROUTES = [
  "/",
  "/how-it-works",
  "/selection",
  "/expert-review",
  "/methodology",
  "/about",
  "/materials",
  "/privacy",
  "/terms",
] as const;

/** Internal product screens and APIs that must stay out of search results. */
export const INTERNAL_ROUTE_PREFIXES = [
  "/api/",
  "/expert/",
  "/journey/",
  "/shortlist/",
  "/property/",
  "/request/",
  "/add-url",
  "/comparison",
] as const;

/**
 * Returns the configured origin without a trailing slash, or null when it is
 * unset or not a usable absolute URL.
 */
export const resolveSiteUrl = (): string | null => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return null;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  return parsed.origin;
};
