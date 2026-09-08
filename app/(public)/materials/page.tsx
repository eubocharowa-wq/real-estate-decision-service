import type { Metadata } from "next";
import Link from "next/link";

import { PublicCta, PublicPageHero } from "../public-page-components";
import { caseStudies } from "../../../src/site-content/case-studies";

export const metadata: Metadata = {
  title: "Материалы — Основание",
  description:
    "Разборы типовых инвестиционных запросов: на чём держится решение и где проходит граница риска.",
};

const audienceTasks = [
  "проверить конкретный объект перед входом;",
  "сравнить несколько вариантов по качеству инвестиционной логики;",
  "понять, где в конструкции сделки скрыт критичный риск.",
];

const evaluationScope = [
  "документы, ограничения и обязательства;",
  "логика объекта или проекта и реалистичность сценария;",
  "устойчивость модели при изменении сроков, расходов и спроса.",
];

const clientOutcome = [
  "ясность, насколько обоснован вход в текущих условиях;",
  "короткий список ключевых уязвимостей и данных для уточнения;",
  "основание идти дальше, пересобирать сценарий или остановиться.",
];

export default function MaterialsPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Материалы"
        title="Разборы"
        lead="Здесь собраны типовые запросы и логика разбора, чтобы до входа понимать, на чём держится решение и где проходит граница риска."
      />

      <section className="public-section" aria-label="Список разборов">
        <h2>Карточки разборов</h2>
        <div className="public-cards">
          {caseStudies.map((study) => (
            <article key={study.slug}>
              <h3>{study.title}</h3>
              <p>{study.summary}</p>
              <p>
                <Link href={`/materials/${study.slug}`}>Подробнее</Link>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="public-section"
        aria-label="С какими задачами приходят"
      >
        <h2>С какими задачами приходят</h2>
        <ul className="public-list">
          {audienceTasks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section
        className="public-section"
        aria-label="Что оценивается в разборе"
      >
        <h2>Что оценивается в разборе</h2>
        <ul className="public-list">
          {evaluationScope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="public-section" aria-label="Что получает клиент">
        <h2>Что получает клиент</h2>
        <ul className="public-list">
          {clientOutcome.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <PublicCta
        title="Не нашли свою ситуацию — начните с подбора"
        text="Подбор бесплатный и покажет на вашей задаче ту же логику, что и в разборах выше."
      />
    </>
  );
}
