export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoney(value: string): number | null {
  const normalized = value.trim().replace(/^[A-Za-z]{3}\s*/u, "").replace(/[$,\s]/g, "").replace(/^\./, "0.");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return roundMoney(parsed);
}

export function formatMoney(amount: number, currency = "SGD"): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(roundMoney(amount));
}

export function formatCompactMoney(amount: number, currency = "SGD"): string {
  const rounded = roundMoney(amount);
  if (rounded === 0) {
    return `${currency} 0.00`;
  }
  return `${currency} ${rounded.toFixed(2)}`;
}

export function formatCalendarCellAmount(amount: number): string {
  const rounded = roundMoney(amount);
  if (rounded >= 10000) {
    return new Intl.NumberFormat("en-SG", {
      notation: "compact",
      maximumFractionDigits: rounded >= 100000 ? 0 : 1
    })
      .format(rounded)
      .replace("K", "k");
  }
  if (rounded >= 1000) {
    return new Intl.NumberFormat("en-SG", {
      maximumFractionDigits: 0,
      useGrouping: false
    }).format(rounded);
  }
  return rounded.toFixed(2);
}
