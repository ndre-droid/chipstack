export type Lang = 'en' | 'de';

/** Number-grouping locale per app language. German (and the rest of Europe) group
 *  thousands with a dot — "3.000" — English with a comma — "3,000". Number format
 *  follows the *chosen language*, not the device locale, so it's identical on the
 *  phone and on a synced TV (whose browser may default to en-US). */
const LOCALE: Record<Lang, string> = { en: 'en-US', de: 'de-DE' };
export function localeFor(lang: string): string {
  return LOCALE[lang as Lang] ?? 'en-US';
}

/** Format a money amount with the chosen currency symbol, grouped for `lang`. */
export function fmtMoney(amount: number, currency: string, lang: string = 'en'): string {
  const abs = Math.abs(amount);
  const decimals = abs < 100 && !Number.isInteger(amount) ? 2 : abs % 1 === 0 ? 0 : 2;
  const n = amount.toLocaleString(localeFor(lang), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  });
  return `${currency}${n}`;
}

/** Plain integer/number grouped for `lang` (e.g. chip points, average stack). */
export function fmtNum(n: number, lang: string = 'en'): string {
  return n.toLocaleString(localeFor(lang));
}

/** Value of a chip-unit amount in real money. */
export function unitsToMoney(units: number, unitValue: number): number {
  return units * unitValue;
}
