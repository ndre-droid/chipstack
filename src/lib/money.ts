/** Format a money amount with the chosen currency symbol. */
export function fmtMoney(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const decimals = abs < 100 && !Number.isInteger(amount) ? 2 : abs % 1 === 0 ? 0 : 2;
  const n = amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  });
  return `${currency}${n}`;
}

/** Value of a chip-unit amount in real money. */
export function unitsToMoney(units: number, unitValue: number): number {
  return units * unitValue;
}

/** Round-trip helper: nice compact number. */
export function compact(n: number): string {
  return n.toLocaleString();
}
