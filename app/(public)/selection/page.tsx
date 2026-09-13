import type { Metadata } from "next";

import { RequestEntry } from "../../request-entry";
import { PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Бесплатный подбор — Основание",
  description:
    "Опишите задачу обычными словами и получите подборку вариантов с объяснением, насколько каждый из них подходит под ваши условия.",
};

export default function SelectionPage() {
  // On the GitHub Pages static export, app/api is removed entirely (see
  // scripts/prepare-github-pages-preview.mjs), so the form below has nothing
  // to submit to. RequestEntry disables submission and says so explicitly
  // instead of silently failing the fetch.
  const staticPreview = process.env.GITHUB_PAGES_STATIC_PREVIEW === "1";
  return (
    <>
      <PublicPageHero
        eyebrow="Бесплатный подбор"
        title="Опишите задачу — получите разобранный список"
        lead="Расскажите, что для вас важно: бюджет, город, сроки, условия ипотеки, ограничения. Сервис разберёт формулировку в условия, покажет, как он вас понял, и предложит варианты с объяснением соответствия."
      />

      <section className="public-section" aria-label="Начать подбор">
        <RequestEntry staticPreview={staticPreview} />
      </section>
    </>
  );
}
