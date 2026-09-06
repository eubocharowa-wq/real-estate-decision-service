import type { Metadata } from "next";

import { RequestEntry } from "../../request-entry";
import { PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Бесплатный подбор — Real Estate Decision Service",
  description:
    "Опишите задачу обычными словами и получите подборку вариантов с объяснением, насколько каждый из них подходит под ваши условия.",
};

export default function SelectionPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Бесплатный подбор"
        title="Опишите задачу — получите разобранный список"
        lead="Расскажите, что для вас важно: бюджет, город, сроки, условия ипотеки, ограничения. Сервис разберёт формулировку в условия, покажет, как он вас понял, и предложит варианты с объяснением соответствия."
      />

      <section className="public-section" aria-label="Начать подбор">
        <RequestEntry />
      </section>
    </>
  );
}
