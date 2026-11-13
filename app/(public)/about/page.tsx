import type { Metadata } from "next";
import Link from "next/link";

import { publicProfile } from "../../../src/site-content/public-profile";
import { PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Елена Бочарова — об эксперте и контакты | Основание",
  description:
    "Елена Бочарова: 15 лет в недвижимости, высшее юридическое образование. Центр ипотеки и недвижимости «Основание». Задачи, подход и прямая связь с экспертом.",
  // The static profile slice does not clear the wider public launch gate.
  robots: { index: false, follow: false },
};

export default function AboutPage() {
  return (
    <div data-contour="invest" className="expert-profile-page">
      <PublicPageHero
        eyebrow="Об эксперте"
        title={publicProfile.name}
        lead={`${publicProfile.brand}. Помогаю разобраться в недвижимости и условиях сделки перед решением: что известно, что вызывает вопросы и что нужно проверить.`}
      >
        <a className="button button-primary" href="#contacts">
          Обсудить задачу
        </a>
        <Link className="button button-secondary" href="/methodology">
          Подход к проверке
        </Link>
      </PublicPageHero>

      <section className="public-section" aria-label="Опыт и образование">
        <h2>Опыт и образование</h2>
        <ul className="expert-facts">
          <li>{publicProfile.experience}</li>
          <li>{publicProfile.education}</li>
        </ul>
        <p>
          Работаю с недвижимостью России. Тула и Тульская область — первая
          территория проекта. Возможность выезда и работу с объектом в другом
          регионе обсуждаем отдельно.
        </p>
      </section>

      <section className="public-section" aria-label="С чем можно обратиться">
        <h2>С чем можно обратиться</h2>
        <ul className="public-list">
          <li>
            Ищете недвижимость: нужно уточнить задачу и сравнить варианты по
            бюджету, срокам и условиям покупки.
          </li>
          <li>
            Объект уже выбран: есть вопросы к документам, состоянию, цене или
            условиям сделки.
          </li>
          <li>
            Сложная ипотечная или юридическая ситуация: нужно разобраться в
            исходных условиях и определить следующие шаги.
          </li>
        </ul>
        <p>
          Для первого разговора достаточно коротко описать ситуацию. До начала
          работы согласуем вопросы, результат, объём, стоимость и срок.
        </p>
      </section>

      <section
        className="public-section"
        aria-label="Что лежит в основе вывода"
      >
        <h2>Что лежит в основе вывода</h2>
        <p>
          Сопоставляю задачу покупателя, доступные документы, сведения об
          объекте и условия сделки. Отделяю подтверждённые данные от заявлений
          продавца и вопросов, на которые пока нет ответа.
        </p>
        <p>
          В выводе должны быть понятны основания, ограничения и следующий шаг.
          Когда информации недостаточно, отмечаю, что ещё требуется выяснить.
          Подробнее — на странице{" "}
          <Link href="/methodology">«Как проверяем»</Link>.
        </p>
        <p>
          Разбор не гарантирует одобрение банка или доходность. Выездной осмотр
          не заменяет техническое обследование, а состав проверки документов
          определяется согласованной задачей.
        </p>
      </section>

      <section
        id="contacts"
        className="public-section expert-contacts"
        aria-labelledby="expert-contacts-title"
      >
        <p className="public-kicker">Прямая связь</p>
        <h2 id="expert-contacts-title">Обсудим вашу задачу</h2>
        <p>
          Можно обратиться напрямую, без предварительного подбора на сайте.
          Напишите, что хотите решить, где находится объект и на каком этапе
          сейчас находитесь. Документы для первого сообщения не нужны.
        </p>
        <div className="public-hero-actions">
          <a
            className="button button-primary"
            href={publicProfile.telegram.href}
          >
            {publicProfile.telegram.label}
          </a>
          <a
            className="button button-secondary"
            href={publicProfile.phone.href}
          >
            {publicProfile.phone.label}
          </a>
        </div>
        <div
          className="expert-community-links"
          aria-label="Сообщества Основания"
        >
          <span>Материалы проекта:</span>
          {publicProfile.communities.map((community) => (
            <a key={community.href} href={community.href}>
              {community.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
