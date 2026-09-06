import type { MetadataRoute } from "next";

import { PUBLIC_ROUTES, resolveSiteUrl } from "../src/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolveSiteUrl();
  // Without a configured origin there are no absolute URLs to publish, and an
  // empty sitemap is preferable to one naming a domain we do not control.
  if (!siteUrl) return [];

  return PUBLIC_ROUTES.map((route) => ({
    url: route === "/" ? siteUrl : `${siteUrl}${route}`,
  }));
}
