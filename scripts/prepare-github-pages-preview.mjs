import { rm, writeFile } from "node:fs/promises";

if (process.env.GITHUB_PAGES_STATIC_PREVIEW !== "1") {
  throw new Error(
    "Refusing to prepare a Pages export outside the dedicated preview workflow.",
  );
}

const serverOnlyRoutes = [
  "app/api",
  "app/add-url",
  "app/comparison",
  "app/expert",
  "app/journey",
  "app/property",
  "app/request",
  "app/shortlist",
];

await Promise.all(
  serverOnlyRoutes.map((route) =>
    rm(route, {
      recursive: true,
      force: true,
    }),
  ),
);

await writeFile(
  "next.config.ts",
  `import type { NextConfig } from "next";

const basePath = "/real-estate-decision-service";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
  typescript: {
    // The normal CI checks the complete repository before the preview build.
    // Pages removes server-only routes in its disposable runner workspace, so
    // test imports that target those routes are intentionally absent here.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
`,
  "utf8",
);

await writeFile(
  "app/robots.ts",
  `import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
`,
  "utf8",
);

await writeFile(
  "app/sitemap.ts",
  `import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
`,
  "utf8",
);

console.log(
  "Prepared the public informational routes for a noindex GitHub Pages export.",
);
