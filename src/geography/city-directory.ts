import { CITY_DIRECTORY } from "./city-directory-data";

/** Lowercases and folds ё/е so declined forms and casing never matter. */
export const normalizeCityKey = (raw: string): string =>
  raw.trim().toLowerCase().replace(/ё/gu, "е");

const formToCanonical = new Map<string, string>(
  CITY_DIRECTORY.flatMap((entry) =>
    [entry.canonical, ...entry.forms].map(
      (form) => [normalizeCityKey(form), entry.canonical] as const,
    ),
  ),
);

/**
 * Resolves a city mention to its canonical spelling when it matches a known
 * declined form ("Туле" -> "Тула"). A city outside the directory is
 * returned exactly as written — nothing is invented for it.
 */
export const resolveCityName = (raw: string): string =>
  formToCanonical.get(normalizeCityKey(raw)) ?? raw.trim();

/**
 * Whether `raw` matches one of this directory's known declined forms,
 * case-insensitively with ё folded to е — e.g. "туле" and "ТУЛЕ" both
 * count. Lets the parser recognize a lowercase city mention ("квартиру в
 * туле") without having to guess at every lowercase word in the request —
 * see extractLocation in src/user-request-parser/extraction.ts, which only
 * accepts an uncapitalized capture when it is a known city this way.
 */
export const isKnownCityForm = (raw: string): boolean =>
  formToCanonical.has(normalizeCityKey(raw));

/**
 * The comparison matching uses: both sides resolved to canonical form
 * first (so any declined form of a known city matches any other), then
 * compared case-insensitively with ё folded to е.
 */
export const cityKeysMatch = (a: string, b: string): boolean =>
  normalizeCityKey(resolveCityName(a)) === normalizeCityKey(resolveCityName(b));

/** Whether `city` matches any entry in `cities`, via cityKeysMatch. */
export const citiesInclude = (
  cities: readonly string[],
  city: string,
): boolean => cities.some((candidate) => cityKeysMatch(candidate, city));
