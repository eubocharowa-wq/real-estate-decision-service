import Link from "next/link";
import type { ReactNode } from "react";

type PublicPageHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
}>;

export function PublicPageHero({
  eyebrow,
  title,
  lead,
  children,
}: PublicPageHeroProps) {
  return (
    <header className="public-page-hero">
      <p className="public-kicker">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="public-lead">{lead}</p>
      {children ? <div className="public-hero-actions">{children}</div> : null}
    </header>
  );
}

type PublicCtaProps = Readonly<{
  title: string;
  text: string;
  href?: string;
  action?: string;
}>;

export function PublicCta({
  title,
  text,
  href = "/selection",
  action = "Начать бесплатный подбор",
}: PublicCtaProps) {
  return (
    <section className="public-cta" aria-label="Следующий шаг">
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button button-primary" href={href}>
        {action}
      </Link>
    </section>
  );
}

export function CoverageStatusNote() {
  return (
    <aside className="coverage-note">
      <p>
        Недоступный источник не исчезает из картины. Если площадка требует вход,
        показывает защитную проверку или не разрешает нужную операцию, сервис
        фиксирует это ограничение вместо того, чтобы молча пропустить объект.
      </p>
      <p>
        Вы видите, каких именно данных не хватает, и можете добавить документ,
        внести данные вручную или передать объект на экспертную проверку.
      </p>
    </aside>
  );
}
