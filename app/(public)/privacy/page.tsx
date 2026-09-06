import type { Metadata } from "next";

import { PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title:
    "Политика обработки персональных данных — Real Estate Decision Service",
  description:
    "Цели и состав обработки персональных данных, сроки хранения, права субъекта и порядок удаления.",
};

const sections = [
  { heading: "Цели обработки", slot: "цели обработки" },
  { heading: "Состав обрабатываемых данных", slot: "состав данных" },
  { heading: "Срок хранения", slot: "срок хранения" },
  { heading: "Права субъекта персональных данных", slot: "права субъекта" },
  { heading: "Порядок удаления данных", slot: "порядок удаления" },
  { heading: "Контакты оператора", slot: "контакты оператора" },
];

export default function PrivacyPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Правовое"
        title="Политика обработки персональных данных"
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
