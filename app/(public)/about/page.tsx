import type { Metadata } from "next";

import { PublicCta, PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Об эксперте — Real Estate Decision Service",
  description:
    "Кто стоит за экспертной проверкой и как устроена ответственность за проверенные данные.",
};

export default function AboutPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Об эксперте"
        title="Об эксперте"
        lead="{{ТРЕБУЕТСЯ ТЕКСТ: об эксперте}}"
      />

      <section className="public-section" aria-label="Опыт">
        <h2>Опыт</h2>
        <p className="public-placeholder">
          {"{{ТРЕБУЕТСЯ ТЕКСТ: об эксперте}}"}
        </p>
      </section>

      <section className="public-section" aria-label="Подход к проверке">
        <h2>Подход к проверке</h2>
        <p className="public-placeholder">
          {"{{ТРЕБУЕТСЯ ТЕКСТ: об эксперте}}"}
        </p>
      </section>

      <section className="public-section" aria-label="Границы ответственности">
        <h2>Границы ответственности</h2>
        <p className="public-placeholder">
          {"{{ТРЕБУЕТСЯ ТЕКСТ: об эксперте}}"}
        </p>
      </section>

      <PublicCta
        title="Начните с подбора"
        text="Экспертная проверка подключается там, где цифровой контур упирается в неподтверждённые данные."
      />
    </>
  );
}
