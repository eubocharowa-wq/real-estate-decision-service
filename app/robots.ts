import type { MetadataRoute } from "next";

import { INTERNAL_ROUTE_PREFIXES, resolveSiteUrl } from "../src/public-site";
import { resolvePilotRuntimeConfig } from "../src/pilot-hardening/config";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();

  // A pilot/demo deployment is not the real product: it must be fully
  // closed to crawlers, never partially indexed, so it can never be cited
  // as evidence that production is live. REDS_APPLICATION_MODE
  // (src/pilot-hardening/config.ts) is the only switch — never the
  // hostname.
  if (resolvePilotRuntimeConfig().mode !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...INTERNAL_ROUTE_PREFIXES],
    },
    // The disallow rules protect internal screens whether or not an origin is
    // configured, so they are always emitted; only the absolute sitemap
    // reference is withheld until the operator sets NEXT_PUBLIC_SITE_URL.
    ...(siteUrl ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  };
}
