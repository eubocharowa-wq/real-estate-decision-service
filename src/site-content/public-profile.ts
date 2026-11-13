/** Owner-supplied public facts; see TASK-MKT-005A and unified plan §5.4/19. */
export const publicProfile = {
  brand: "Центр ипотеки и недвижимости «Основание»",
  brandDescriptor: "Центр ипотеки и недвижимости",
  shortBrand: "Основание",
  name: "Елена Бочарова",
  experience: "15 лет в недвижимости",
  education: "Высшее юридическое образование",
  contactsHref: "/about#contacts",
  phone: { label: "+7 (910) 943-44-22", href: "tel:+79109434422" },
  telegram: {
    label: "Написать Елене в Telegram",
    href: "https://t.me/ELENA_BOCHAROWA",
  },
  communities: [
    { label: "Сообщество VK", href: "https://vk.ru/club231315767" },
    { label: "Канал в Telegram", href: "https://t.me/gid_novostroek_tula" },
  ],
} as const;
