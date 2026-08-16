type MoneyLike = { readonly amount: string; readonly currency: string };

const CURRENCY_LOCALE = "ru-RU";

export const formatMoney = (money: MoneyLike): string =>
  new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0,
  }).format(Number(money.amount));

export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(CURRENCY_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));

export const asMoneyLike = (value: unknown): MoneyLike | null => {
  if (typeof value !== "object" || value === null) return null;
  const amount = Reflect.get(value, "amount");
  const currency = Reflect.get(value, "currency");
  return typeof amount === "string" && typeof currency === "string"
    ? { amount, currency }
    : null;
};

export const formatArea = (value: number): string =>
  `${new Intl.NumberFormat(CURRENCY_LOCALE, { maximumFractionDigits: 1 }).format(value)} м²`;
