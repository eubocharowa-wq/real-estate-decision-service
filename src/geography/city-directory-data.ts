/**
 * Cities the service currently recognizes by name, with their Russian case
 * forms, as plain data — see AGENTS.md §18: a city is never hardcoded into
 * the parser or the matching engine, only looked up here.
 *
 * Seeded from the two places a real city name can come from today:
 * src/site-content/regions.ts (the pilot region pages) and the real,
 * manually curated pilot candidates under data/examples/real-pilot. Add a
 * city by adding an entry here — nothing elsewhere needs to change.
 *
 * `forms` lists every inflected spelling worth recognizing (nominative,
 * genitive, dative/locative, accusative, instrumental); `canonical` is what
 * a recognized mention is normalized to. A city not listed here is kept
 * exactly as the user or the source wrote it — see
 * src/geography/city-directory.ts's resolveCityName.
 */
export interface CityDirectoryEntry {
  readonly canonical: string;
  readonly forms: readonly string[];
}

export const CITY_DIRECTORY: readonly CityDirectoryEntry[] = [
  {
    canonical: "Тула",
    forms: ["Тула", "Тулы", "Туле", "Тулу", "Тулой"],
  },
];
