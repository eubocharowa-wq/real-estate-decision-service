import Link from "next/link";

import { resolvePilotRuntimeConfig } from "../../src/pilot-hardening/config";
import { publicProfile } from "../../src/site-content/public-profile";

type NavigationItem = Readonly<{
  href: string;
  label: string;
}>;

/**
 * scripts/prepare-github-pages-preview.mjs deletes app/comparison (and other
 * server-only routes) before the static export builds. Without this filter,
 * "Сравнение" would render as a nav link to a page that does not exist in
 * that build — scripts/check-pages-preview-links.mjs would then fail the
 * build on that dead link, which is the backstop if this list and the
 * script's own route list ever drift apart.
 */
const isPagesPreview = process.env.GITHUB_PAGES_STATIC_PREVIEW === "1";
const PAGES_PREVIEW_EXCLUDED_HREFS: ReadonlySet<string> = new Set([
  "/comparison",
]);

const navigation: readonly NavigationItem[] = [
  { href: "/selection", label: "Подбор" },
  { href: "/how-it-works", label: "Как это работает" },
  { href: "/comparison", label: "Сравнение" },
  { href: "/expert-review", label: "Экспертная проверка" },
  { href: "/methodology", label: "Как проверяем" },
  { href: "/materials", label: "Материалы" },
].filter(
  (item) => !isPagesPreview || !PAGES_PREVIEW_EXCLUDED_HREFS.has(item.href),
);

const aboutLink: NavigationItem = { href: "/about", label: "Об эксперте" };
const contactsLink: NavigationItem = {
  href: publicProfile.contactsHref,
  label: "Контакты",
};

/**
 * A pilot/demo deployment must say so, visibly, on every public page — not
 * just via robots/noindex — so nobody mistakes it for the live product.
 * REDS_APPLICATION_MODE (src/pilot-hardening/config.ts) is the only switch.
 */
export function PilotModeBanner() {
  if (resolvePilotRuntimeConfig().mode === "production") return null;
  return (
    <p className="pilot-mode-banner" role="note">
      Пилот. Данные ограничены.
    </p>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-identity" href="/" aria-label="На главную">
          <span className="site-identity-descriptor">
            {publicProfile.brandDescriptor}
          </span>
          <span className="brand-mark">{publicProfile.shortBrand}</span>
        </Link>

        <nav className="site-nav" aria-label="Основная навигация">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <Link className="site-header-contact" href={contactsLink.href}>
          {contactsLink.label}
        </Link>

        <Link
          className="button button-primary button-small site-header-cta"
          href="/selection"
        >
          Начать подбор
        </Link>

        <details className="site-menu">
          <summary>Меню</summary>
          <nav aria-label="Меню разделов">
            {[...navigation, aboutLink, contactsLink].map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <section className="site-footer-column" aria-label="Продукт">
          <h2>Продукт</h2>
          <ul>
            {navigation.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="site-footer-column" aria-label="О сервисе">
          <h2>О сервисе</h2>
          <ul>
            <li>
              <Link href={aboutLink.href}>{aboutLink.label}</Link>
            </li>
            <li>
              <Link href="/methodology">Как проверяем</Link>
            </li>
          </ul>
        </section>

        <section className="site-footer-column" aria-label="Связь и сообщества">
          <h2>Связь и сообщества</h2>
          <ul>
            <li>
              <Link href={contactsLink.href}>{contactsLink.label}</Link>
            </li>
            <li>
              <a href={publicProfile.phone.href}>{publicProfile.phone.label}</a>
            </li>
            <li>
              <a href={publicProfile.telegram.href}>
                {publicProfile.telegram.label}
              </a>
            </li>
            {publicProfile.communities.map((community) => (
              <li key={community.href}>
                <a href={community.href}>{community.label}</a>
              </li>
            ))}
          </ul>
        </section>

        <section className="site-footer-column" aria-label="Правовое">
          <h2>Правовое</h2>
          <ul>
            <li>
              <Link href="/privacy">Обработка персональных данных</Link>
            </li>
            <li>
              <Link href="/terms">Пользовательское соглашение</Link>
            </li>
          </ul>
        </section>
      </div>
    </footer>
  );
}
