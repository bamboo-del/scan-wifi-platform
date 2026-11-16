const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const compactNumberFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("zh-CN");

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

export function formatPercent(value: number): string {
  const normalized = value > 1 ? value : value * 100;
  return `${normalized.toFixed(1)}%`;
}

export function formatShortDate(value: string): string {
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[1] ?? ""}-${parts[2] ?? ""}`;
}

export function todayLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}
