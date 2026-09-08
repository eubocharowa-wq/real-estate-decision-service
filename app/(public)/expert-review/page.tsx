import type { Metadata } from "next";

import { PublicCta, PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Экспертная проверка — Основание",
  description:
    "Платная проверка там, где цифровой контур упирается в неподтверждённые данные, конфликт источников или документы.",
};

const triggers = [
  "критичное для вас условие осталось неподтверждённым;",
  "источники расходятся между собой, и непонятно, какому верить;",
  "нужно разобрать документы по объекту;",
  "вы выбираете между двумя-тремя финалистами;",
  "объект нужно посмотреть физически.",
];

// This page is the paid ЦБИ expert/investment-analysis service — the same
// expertise-and-trust identity as /about — so its content area opts into the
// dark, gold-accented density (data-contour="invest") while the shared
// header and footer stay in the light buyer density. The rest of the
// selection product stays light — one design system, two densities, see
// app/design-system.css.
export default function ExpertReviewPage() {
  return (
    <div data-contour="invest">
      <PublicPageHero
        eyebrow="Экспертная проверка"
        title="Проверка там, где данных недостаточно"
        lead="Бесплатный контур честно показывает, чего он не знает. Экспертная проверка закрывает именно эти места — не заменяя цифровой слой, а достраивая его."
      />

      <section className="public-section" aria-label="Когда нужна проверка">
        <h2>Когда это нужно</h2>
        <p>Проверку имеет смысл запрашивать, если:</p>
        <ul className="public-list">
          {triggers.map((trigger) => (
            <li key={trigger}>{trigger}</li>
          ))}
        </ul>
      </section>

      <section className="public-section" aria-label="Что входит в услугу">
        <h2>Что входит</h2>
        <p className="public-placeholder">
          {"{{ТРЕБУЕТСЯ ТЕКСТ: состав услуги}}"}
        </p>
      </section>

      <section className="public-section" aria-label="Цена и срок">
        <h2>Цена и срок</h2>
        <p className="public-placeholder">
          {"{{ТРЕБУЕТСЯ ТЕКСТ: цена и срок}}"}
        </p>
      </section>

      <section
        className="public-section"
        aria-label="Отличие от бесплатного контура"
      >
        <h2>Чем это отличается от бесплатного подбора</h2>
        <p>
          Бесплатный подбор работает с тем, что удалось получить из подключённых
          источников: разбирает вашу задачу, сравнивает варианты, считает
          соответствие и отдельно — надёжность данных. Он не превращает
          заявленное в подтверждённое и прямо помечает то, что осталось
          неизвестным.
        </p>
        <p>
          Экспертная проверка добавляет то, чего в источниках нет: ручную
          проверку конкретного условия, разбор документов, при необходимости —
          выезд на объект. Результат проверки попадает в тот же слой
          доказательств, что и остальные данные, а не в отдельную непрозрачную
          заметку.
        </p>
        <p>
          Разбор документа не является юридическим заключением, визуальный
          осмотр — техническим обследованием, а расчёт по ипотеке — одобрением
          банка.
        </p>
      </section>

      <PublicCta
        title="Сначала бесплатный подбор"
        text="Проверку удобнее заказывать, когда уже понятно, какое именно условие вызывает сомнение. Начните с подбора — он покажет, что осталось неподтверждённым."
      />
    </div>
  );
}
