import { mkdir, rm, writeFile } from "node:fs/promises";

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

await mkdir("app/(public)/comparison", { recursive: true });

await writeFile(
  "app/(public)/comparison/page.tsx",
  `import type { Metadata } from "next";

import { PublicCta, PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Сравнение — Real Estate Decision Service",
  description:
    "Обзор принципов сравнения вариантов в статической версии сайта.",
};

export default function StaticComparisonPreviewPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Сравнение"
        title="Сравнение вариантов"
        lead="Рабочая версия ставит рядом 2–4 объекта и отдельно показывает соответствие запросу, надёжность данных, существенные различия и вопросы, которые ещё нужно проверить."
      />

      <section className="public-section" aria-label="Что показывает сравнение">
        <h2>Что будет видно в таблице решения</h2>
        <ul>
          <li>насколько каждый объект соответствует именно вашему запросу;</li>
          <li>какие обязательные условия выполнены, не выполнены или пока неизвестны;</li>
          <li>насколько надёжны сведения и какими источниками они подтверждены;</li>
          <li>какие преимущества, компромиссы и риски действительно меняют выбор.</li>
        </ul>
      </section>

      <aside className="coverage-note">
        <p>
          Это статический просмотр публичной части на GitHub Pages. Интерактивная
          таблица, сохранение вариантов, парсинг источников и персональный расчёт
          требуют серверной версии и здесь не имитируются.
        </p>
      </aside>

      <PublicCta
        title="Посмотрите правила проверки"
        text="Методика объясняет, почему соответствие запросу и надёжность данных считаются отдельно."
        href="/methodology"
        action="Как проверяем данные"
      />
    </>
  );
}
`,
  "utf8",
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

export const dynamic = "force-static";

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

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
`,
  "utf8",
);

console.log(
  "Prepared the public informational routes for a noindex GitHub Pages export.",
);
