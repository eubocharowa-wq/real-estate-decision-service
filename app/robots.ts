import type { MetadataRoute } from "next";

import { INTERNAL_ROUTE_PREFIXES, resolveSiteUrl } from "../src/public-site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();

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
