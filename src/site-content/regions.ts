/**
 * Regions the service is presented in. Regional routes (`/tula`) are
 * generated from this registry via `generateStaticParams` rather than
 * hand-written per city, so the geography can grow beyond the pilot city
 * without adding route files — see AGENTS.md §18: the city is data, never
 * hardcoded into schema, routing or matching.
 */
export interface SiteRegion {
  readonly slug: string;
  readonly name: string;
  readonly nameLocative: string;
  readonly federalSubject: string;
  readonly headline: string;
  readonly lead: string;
  readonly metaDescription: string;
}

export const siteRegions: readonly SiteRegion[] = [
  {
    slug: "tula",
    name: "Тула",
    nameLocative: "в Туле",
    federalSubject: "Тульская область",
    headline: "Недвижимость в Туле",
    lead: "Пилотный регион сервиса. Опишите задачу — сервис подберёт варианты по вашим условиям и покажет, чему из данных можно доверять.",
    metaDescription:
      "Бесплатный подбор недвижимости в Туле под ваши условия, с объяснением соответствия и надёжности данных.",
  },
];

export const findSiteRegion = (slug: string): SiteRegion | undefined =>
  siteRegions.find((region) => region.slug === slug);
