// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import AboutPage, {
  metadata as aboutMetadata,
} from "../app/(public)/about/page";
import ExpertReviewPage, {
  metadata as expertReviewMetadata,
} from "../app/(public)/expert-review/page";
import HowItWorksPage from "../app/(public)/how-it-works/page";
import MaterialsPage from "../app/(public)/materials/page";
import CaseStudyPage, {
  generateStaticParams as generateCaseStudyParams,
} from "../app/(public)/materials/[materialSlug]/page";
import MethodologyPage from "../app/(public)/methodology/page";
import HomePage from "../app/(public)/page";
import PrivacyPage, {
  metadata as privacyMetadata,
} from "../app/(public)/privacy/page";
import SelectionPage from "../app/(public)/selection/page";
import {
  PilotModeBanner,
  SiteFooter,
  SiteHeader,
} from "../app/(public)/site-chrome";
import TermsPage, {
  metadata as termsMetadata,
} from "../app/(public)/terms/page";
import RegionPage, {
  generateStaticParams as generateRegionParams,
} from "../app/(public)/[region]/page";
import {
  INTERNAL_ROUTE_PREFIXES,
  PLACEHOLDER_BLOCKED_ROUTES,
  allPublicRoutes,
} from "../src/public-site";
import { caseStudies } from "../src/site-content/case-studies";
import { cbiContacts } from "../src/site-content/contacts";
import { siteRegions } from "../src/site-content/regions";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const navigationLabels = [
  "Подбор",
  "Как это работает",
  "Сравнение",
  "Экспертная проверка",
  "Как проверяем",
  "Материалы",
];

describe("public site chrome", () => {
  it("renders the header with its identity link and primary call to action", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeDefined();
    expect(screen.getByLabelText("На главную").getAttribute("href")).toBe("/");
    expect(
      screen.getByRole("link", { name: "Начать подбор" }).getAttribute("href"),
    ).toBe("/selection");
  });

  it("shows the site name as «Основание», not the old working brand", () => {
    render(<SiteHeader />);

    expect(screen.getByText("Основание")).toBeDefined();
    expect(screen.queryByText(/Decision Service/)).toBeNull();
    expect(screen.queryByText(/\bREDS\b/)).toBeNull();
  });

  it("exposes every navigation item in the main navigation", () => {
    render(<SiteHeader />);

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Основная навигация",
    });

    for (const label of navigationLabels) {
      expect(
        within(primaryNavigation).getByRole("link", { name: label }),
      ).toBeDefined();
    }

    expect(
      within(primaryNavigation)
        .getByRole("link", { name: "Как это работает" })
        .getAttribute("href"),
    ).toBe("/how-it-works");
  });

  it("repeats the navigation in the mobile menu and adds the about link", () => {
    render(<SiteHeader />);

    const menu = screen.getByRole("navigation", { name: "Меню разделов" });

    expect(screen.getByText("Меню")).toBeDefined();
    for (const label of [...navigationLabels, "Об эксперте", "Контакты"]) {
      expect(within(menu).getByRole("link", { name: label })).toBeDefined();
    }
    expect(
      within(menu).getByRole("link", { name: "Контакты" }).getAttribute("href"),
    ).toBe("/about#contacts");
  });

  it("renders the footer columns", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeDefined();
    expect(
      within(screen.getByRole("region", { name: "Продукт" })).getAllByRole(
        "link",
      ),
    ).toHaveLength(navigationLabels.length);

    const about = screen.getByRole("region", { name: "О сервисе" });
    expect(
      within(about)
        .getByRole("link", { name: "Об эксперте" })
        .getAttribute("href"),
    ).toBe("/about");
    expect(
      within(about)
        .getByRole("link", { name: "Как проверяем" })
        .getAttribute("href"),
    ).toBe("/methodology");

    const legal = screen.getByRole("region", { name: "Правовое" });
    expect(
      within(legal)
        .getByRole("link", { name: "Обработка персональных данных" })
        .getAttribute("href"),
    ).toBe("/privacy");
    expect(
      within(legal)
        .getByRole("link", { name: "Пользовательское соглашение" })
        .getAttribute("href"),
    ).toBe("/terms");
  });

  it("shows the pilot banner outside production, and nothing in production", () => {
    vi.stubEnv("REDS_APPLICATION_MODE", "pilot");
    const { unmount } = render(<PilotModeBanner />);
    expect(screen.getByRole("note").textContent).toBe(
      "Пилот. Данные ограничены.",
    );
    unmount();

    vi.stubEnv("REDS_APPLICATION_MODE", "production");
    const { container } = render(<PilotModeBanner />);
    expect(container.textContent).toBe("");
  });

  it("keeps direct expert contact separate from the two community destinations", () => {
    render(<SiteFooter />);
    const contacts = screen.getByRole("region", { name: "Связь и сообщества" });
    for (const [label, href] of [
      ["Контакты", "/about#contacts"],
      ["+7 (910) 943-44-22", "tel:+79109434422"],
      ["Написать Елене в Telegram", "https://t.me/ELENA_BOCHAROWA"],
      ["Сообщество VK", "https://vk.ru/club231315767"],
      ["Канал в Telegram", "https://t.me/gid_novostroek_tula"],
    ]) {
      expect(
        within(contacts)
          .getByRole("link", { name: label })
          .getAttribute("href"),
      ).toBe(href);
    }
  });

  it("points every navigation link at a route that exists", () => {
    render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>,
    );

    const appDirectory = join(process.cwd(), "app");
    const hrefs = new Set(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/")),
    );

    expect(hrefs.size).toBeGreaterThan(0);
    for (const href of hrefs) {
      const pathname = href.split("#")[0];
      const segment = pathname === "/" ? "" : pathname.slice(1);
      // Public pages live in the (public) route group, internal screens sit
      // directly under app/ — either location answers the URL.
      const candidates = [
        join(appDirectory, "(public)", segment, "page.tsx"),
        join(appDirectory, segment, "page.tsx"),
      ];
      expect(
        candidates.some((candidate) => existsSync(candidate)),
        `no page renders ${href}`,
      ).toBe(true);
    }
  });
});

describe("public content pages", () => {
  it("renders the selection entry point for a synthetic test", async () => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "synthetic_test");
    render(await SelectionPage());

    expect(
      screen.getByRole("heading", {
        name: "Опишите задачу — получите разобранный список",
      }),
    ).toBeDefined();
    expect(
      screen.getByText("Опишите, какую недвижимость вы ищете"),
    ).toBeDefined();
  });

  it("renders the how-it-works journey", () => {
    render(<HowItWorksPage />);

    expect(
      screen.getByRole("heading", { name: "Как работает подбор" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", {
        name: "Каждый вариант получает две отдельные оценки",
      }),
    ).toBeDefined();
  });

  it("renders expert review with unresolved copy marked as a placeholder, in the invest contour", () => {
    const { container } = render(<ExpertReviewPage />);

    expect(
      screen.getByRole("heading", {
        name: "Проверка там, где данных недостаточно",
      }),
    ).toBeDefined();
    expect(
      screen.getByText("{{ТРЕБУЕТСЯ ТЕКСТ: состав услуги}}"),
    ).toBeDefined();
    expect(screen.getByText("{{ТРЕБУЕТСЯ ТЕКСТ: цена и срок}}")).toBeDefined();
    expect(container.querySelector('[data-contour="invest"]')).not.toBeNull();
    expect(expertReviewMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("renders the methodology page with the coverage note", () => {
    render(<MethodologyPage />);

    expect(
      screen.getByRole("heading", {
        name: "Соответствие и надёжность данных — разные величины",
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Неизвестное — это не «нет»" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", {
        name: "Процент соответствия не назначает языковая модель",
      }),
    ).toBeDefined();
    expect(
      screen.getByText(/Недоступный источник не исчезает из картины/),
    ).toBeDefined();
  });

  it("offers a factual expert profile and direct contact while intake is closed", () => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "closed");
    const { container } = render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Елена Бочарова" }),
    ).toBeDefined();
    expect(screen.getByText("15 лет в недвижимости")).toBeDefined();
    expect(screen.getByText("Высшее юридическое образование")).toBeDefined();
    expect(
      screen.getByText(/Центр ипотеки и недвижимости «Основание»/),
    ).toBeDefined();
    expect(
      screen.queryByText(/Центр Бизнес|скрининг|брокерскими по смыслу/),
    ).toBeNull();
    const contacts = screen.getByRole("region", {
      name: "Обсудим вашу задачу",
    });
    expect(contacts.id).toBe("contacts");
    expect(
      screen
        .getByRole("link", { name: "Обсудить задачу" })
        .getAttribute("href"),
    ).toBe("#contacts");
    expect(
      within(contacts)
        .getByRole("link", { name: "Написать Елене в Telegram" })
        .getAttribute("href"),
    ).toBe("https://t.me/ELENA_BOCHAROWA");
    expect(
      within(contacts)
        .getByRole("link", { name: "+7 (910) 943-44-22" })
        .getAttribute("href"),
    ).toBe("tel:+79109434422");
    expect(
      container.querySelector('form, input, textarea, a[href="/selection"]'),
    ).toBeNull();
    expect(screen.queryByText(/ТРЕБУЕТСЯ ТЕКСТ/)).toBeNull();
    expect(container.querySelector('[data-contour="invest"]')).not.toBeNull();
    expect(aboutMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("lets a home-page visitor reach the expert without entering a selection journey", () => {
    render(<HomePage />);
    expect(
      screen
        .getByRole("link", { name: "Обсудить задачу с Еленой" })
        .getAttribute("href"),
    ).toBe("/about#contacts");
    for (const link of screen.getAllByRole("link", {
      name: "Начать бесплатный подбор",
    })) {
      expect(link.getAttribute("href")).toBe("/selection");
    }
  });

  it("renders materials with case-study cards linking to their own pages", () => {
    render(<MaterialsPage />);

    expect(screen.getByRole("heading", { name: "Разборы" })).toBeDefined();
    expect(screen.getAllByRole("article")).toHaveLength(caseStudies.length);
    expect(
      screen.getByRole("heading", { name: caseStudies[0].title }),
    ).toBeDefined();

    const studyLinks = screen.getAllByRole("link", { name: "Подробнее" });
    expect(studyLinks).toHaveLength(caseStudies.length);
    expect(studyLinks[0].getAttribute("href")).toBe(
      `/materials/${caseStudies[0].slug}`,
    );
  });

  it("builds a case-study page for every registry entry", () => {
    expect(generateCaseStudyParams()).toEqual(
      caseStudies.map((study) => ({ materialSlug: study.slug })),
    );
  });

  it("renders an individual case-study page from the registry", async () => {
    const study = caseStudies[0];
    const jsx = await CaseStudyPage({
      params: Promise.resolve({ materialSlug: study.slug }),
    });
    render(jsx);

    expect(
      screen.getByRole("heading", { level: 1, name: study.title }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Вернуться к списку разборов" }),
    ).toBeDefined();
  });

  it("builds a region page for every registry entry", () => {
    expect(generateRegionParams()).toEqual(
      siteRegions.map((region) => ({ region: region.slug })),
    );
  });

  it("renders the pilot region page", async () => {
    const region = siteRegions[0];
    const jsx = await RegionPage({
      params: Promise.resolve({ region: region.slug }),
    });
    render(jsx);

    expect(
      screen.getByRole("heading", { level: 1, name: region.headline }),
    ).toBeDefined();
  });

  it("renders the privacy policy structured after ЦБИ's own document, with real contacts", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", {
        name: "Политика в отношении обработки персональных данных",
      }),
    ).toBeDefined();
    for (const heading of [
      "1. Общие положения",
      "2. Какие данные могут обрабатываться",
      "3. Цели обработки",
      "4. Передача третьим лицам",
      "5. Срок хранения",
      "6. Ваши действия",
      "7. Контакты оператора",
      "8. Изменения политики",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeDefined();
    }
    expect(screen.getByText(cbiContacts.phone.label)).toBeDefined();
    expect(screen.getByText(cbiContacts.email.label)).toBeDefined();
    expect(
      screen.queryByText("{{ТРЕБУЕТСЯ ТЕКСТ: контакты оператора}}"),
    ).toBeNull();
    expect(screen.queryByText(/Демо-диалог/)).toBeNull();
    expect(
      screen.getByText("{{ТРЕБУЕТСЯ ДОПОЛНЕНИЕ: обработка данных подбора}}"),
    ).toBeDefined();
    expect(privacyMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("renders the terms structured after ЦБИ's own offer, with real contacts", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", {
        name: "Публичная оферта на оказание экспертных услуг",
      }),
    ).toBeDefined();
    for (const heading of [
      "1. Термины",
      "2. Акцепт оферты",
      "3. Порядок оказания услуг",
      "4. Результат и ответственность",
      "5. Оплата и возврат",
      "6. Конфиденциальность",
      "7. Реквизиты и связь",
      "8. Заключительные положения",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeDefined();
    }
    expect(screen.getByText(cbiContacts.phone.label)).toBeDefined();
    expect(
      screen.getAllByText(cbiContacts.telegramChannels[0].label).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/ТРЕБУЕТСЯ ТЕКСТ/)).toBeNull();
    expect(termsMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("sitemap", () => {
  it("lists every public page, including generated case studies and regions", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");

    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain("https://example.com");
    expect(urls).toContain("https://example.com/how-it-works");
    expect(urls).toContain(
      `https://example.com/materials/${caseStudies[0].slug}`,
    );
    expect(urls).toContain(`https://example.com/${siteRegions[0].slug}`);
    expect(urls).toHaveLength(allPublicRoutes().length);
  });

  it("keeps internal screens, and pages still carrying placeholder copy, out of the sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");

    const paths = sitemap().map((entry) => new URL(entry.url).pathname);

    // Prefix comparison, not substring: /expert-review is a public route and
    // must not be caught by the /expert/ rule that hides the expert
    // workbench — it is excluded below for its own, separate reason.
    for (const internal of INTERNAL_ROUTE_PREFIXES) {
      expect(paths.some((path) => path.startsWith(internal))).toBe(false);
    }
    for (const route of PLACEHOLDER_BLOCKED_ROUTES) {
      expect(paths).not.toContain(route);
    }
  });

  it("publishes nothing when no origin is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    expect(sitemap()).toEqual([]);
  });

  it("publishes nothing when the origin is malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "example.com");

    expect(sitemap()).toEqual([]);
  });
});

describe("robots", () => {
  it("disallows the internal screens and points at the sitemap in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("REDS_APPLICATION_MODE", "production");

    const result = robots();

    expect(result.sitemap).toBe("https://example.com/sitemap.xml");
    expect(result.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/expert/",
        "/journey/",
        "/shortlist/",
        "/property/",
        "/request/",
        "/add-url",
        "/comparison",
      ],
    });
  });

  it("keeps the disallow rules but omits the sitemap without an origin, in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("REDS_APPLICATION_MODE", "production");

    const result = robots();

    expect(result.sitemap).toBeUndefined();
    expect(robots().rules).toEqual(result.rules);
    expect(
      Array.isArray(result.rules) ? [] : (result.rules.disallow ?? []),
    ).toContain("/expert/");
  });

  // A pilot/demo deployment is not the real product and must never be
  // partially indexed — only REDS_APPLICATION_MODE decides this, never the
  // hostname, so an origin being configured must not change the outcome.
  for (const mode of ["demo", "pilot"] as const) {
    it(`fully disallows crawling in ${mode} mode, even with an origin configured`, () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
      vi.stubEnv("REDS_APPLICATION_MODE", mode);

      const result = robots();

      expect(result.sitemap).toBeUndefined();
      expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    });
  }

  it("fully disallows crawling by default, when REDS_APPLICATION_MODE is unset", () => {
    expect(process.env.REDS_APPLICATION_MODE).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");

    const result = robots();

    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
