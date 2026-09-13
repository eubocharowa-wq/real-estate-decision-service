/**
 * Public site addressing.
 *
 * The canonical origin is supplied by the operator through
 * NEXT_PUBLIC_SITE_URL. It is deliberately not defaulted: emitting a sitemap,
 * a robots reference or a metadataBase that points at a domain nobody owns is
 * worse than emitting nothing, so every consumer degrades to "no absolute
 * URLs" when the variable is missing or malformed.
 */

import { caseStudies } from "../site-content/case-studies";
import { siteRegions } from "../site-content/regions";

/** Static routes served by the (public) group and safe for search engines. */
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

/**
 * Public routes carrying unresolved {{ТРЕБУЕТСЯ ТЕКСТ}} placeholders (or
 * still pending the same content review as the pages that do). They stay
 * reachable and linked from navigation — see each page's own
 * `metadata.robots` for the matching noindex — but must not be listed in the
 * sitemap while their copy is not final. Remove an entry here, and its
 * page's noindex, once that page's placeholders are closed with real text.
 */
export const PLACEHOLDER_BLOCKED_ROUTES = [
  "/expert-review",
  "/about",
  "/privacy",
  "/terms",
] as const;

/**
 * All public routes, including the ones generated from a registry via
 * generateStaticParams (case studies, regions) rather than written by hand.
 */
export const allPublicRoutes = (): readonly string[] => [
  ...PUBLIC_ROUTES.filter(
    (route) =>
      !(PLACEHOLDER_BLOCKED_ROUTES as readonly string[]).includes(route),
  ),
  ...caseStudies.map((study) => `/materials/${study.slug}`),
  ...siteRegions.map((region) => `/${region.slug}`),
];

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
