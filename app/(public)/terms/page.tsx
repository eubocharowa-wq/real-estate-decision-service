import type { Metadata } from "next";

import { PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — Real Estate Decision Service",
  description:
    "Предмет соглашения, границы возможностей сервиса, отказ от гарантий по решениям пользователя и порядок оказания платной экспертной проверки.",
};

const sections = [
  { heading: "Предмет соглашения", slot: "предмет соглашения" },
  {
    heading: "Что сервис делает и чего не делает",
    slot: "границы возможностей сервиса",
  },
  {
    heading: "Отказ от гарантий по решениям пользователя",
    slot: "отказ от гарантий",
  },
  {
    heading: "Порядок оказания платной экспертной проверки",
    slot: "порядок оказания экспертной проверки",
  },
];

export default function TermsPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Правовое"
        title="Пользовательское соглашение"
        lead="Документ ещё не опубликован. Разделы ниже задают структуру, текст готовит владелец сервиса."
      />

      {sections.map((section) => (
        <section
          key={section.heading}
          className="public-section"
          aria-label={section.heading}
        >
          <h2>{section.heading}</h2>
          <p className="public-placeholder">
            {`{{ТРЕБУЕТСЯ ТЕКСТ: ${section.slot}}}`}
          </p>
        </section>
      ))}
    </>
  );
}
