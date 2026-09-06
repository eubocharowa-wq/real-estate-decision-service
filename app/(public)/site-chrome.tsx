import Link from "next/link";

type NavigationItem = Readonly<{
  href: string;
  label: string;
}>;

const navigation: readonly NavigationItem[] = [
  { href: "/selection", label: "Подбор" },
  { href: "/how-it-works", label: "Как это работает" },
  { href: "/comparison", label: "Сравнение" },
  { href: "/expert-review", label: "Экспертная проверка" },
  { href: "/methodology", label: "Как проверяем" },
  { href: "/materials", label: "Материалы" },
];

const aboutLink: NavigationItem = { href: "/about", label: "Об эксперте" };

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-identity" href="/" aria-label="На главную">
          <span className="brand-mark">
            Decision <span>Service</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Основная навигация">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          className="button button-primary button-small site-header-cta"
          href="/selection"
        >
          Начать подбор
        </Link>

        <details className="site-menu">
          <summary>Меню</summary>
          <nav aria-label="Меню разделов">
            {[...navigation, aboutLink].map((item) => (
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

        {/* Правовые ссылки появятся вместе с контентными страницами (блок C). */}
        <section className="site-footer-column" aria-label="Правовое">
          <h2>Правовое</h2>
        </section>
      </div>
    </footer>
  );
}
