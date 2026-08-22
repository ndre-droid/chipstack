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

/**
 * Parse a money amount the user typed.
 *
 * `<input type="number">` looks right for money and is wrong for it here: on a
 * German keyboard the decimal key is a COMMA, and Chrome answers a comma by handing
 * the app an EMPTY string — the amount silently becomes 0 with nothing on screen to
 * explain it. So money fields are plain text with `inputMode="decimal"` and the
 * value is normalised here instead. Grouping separators are tolerated: "1.234,50"
 * and "1,234.50" both read as 1234.5, and so does an unaccompanied "1.234".
 */
/** A lone separator followed by exactly three digits — "1.234" / "1,234" — is a
 *  thousands group, not a decimal point: as money, 1.234 is not an amount anybody
 *  types. Excluded when the part in front is "0", so a chip value like "0,001"
 *  keeps its decimal meaning. */
const GROUPED_ONLY = /^(?!0[.,])\d{1,3}[.,]\d{3}$/;

export function parseMoney(text: string): number {
  const raw = String(text).replace(/[\s ']/g, '');
  if (!raw) return 0;
  if (GROUPED_ONLY.test(raw)) return parseFloat(raw.replace(/[.,]/g, ''));
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  // whichever separator comes last is the decimal point; the other one groups
  const normalised =
    lastComma > lastDot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  const n = parseFloat(normalised);
  return Number.isFinite(n) ? n : 0;
}
