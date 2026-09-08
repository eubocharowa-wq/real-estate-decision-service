import type { ReactNode } from "react";

/**
 * ЦБИ contacts, transferred verbatim from SAIT-CBI (src/svyaz.html and the
 * contact block of src/index.html). This is the single place the phone,
 * email and both Telegram handles are defined — /privacy and /terms both
 * read from here instead of repeating the values.
 */
export const cbiContacts = {
  name: "Елена Бочарова",
  phone: { label: "+7 (910) 943-44-22", href: "tel:+79109434422" },
  email: {
    label: "e.u.bocharowa@yandex.ru",
    href: "mailto:e.u.bocharowa@yandex.ru",
  },
  telegramChannels: [
    { label: "@CENTR_BIZNES_INVEST", href: "https://t.me/CENTR_BIZNES_INVEST" },
    { label: "@ELENA_BOCHAROWA", href: "https://t.me/ELENA_BOCHAROWA" },
  ],
} as const;

/** Renders the contacts above as a definition list, for legal pages. */
export function ContactDetails(): ReactNode {
  return (
    <dl className="contact-details">
      <div>
        <dt>Телефон</dt>
        <dd>
          <a href={cbiContacts.phone.href}>{cbiContacts.phone.label}</a>
        </dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd>
          <a href={cbiContacts.email.href}>{cbiContacts.email.label}</a>
        </dd>
      </div>
      {cbiContacts.telegramChannels.map((channel) => (
        <div key={channel.href}>
          <dt>Telegram</dt>
          <dd>
            <a href={channel.href} target="_blank" rel="noopener noreferrer">
              {channel.label}
            </a>
          </dd>
        </div>
      ))}
    </dl>
  );
}
