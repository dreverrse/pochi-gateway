const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullNumber = new Intl.NumberFormat("en-US");

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

const budgetUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const priceUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatCompact(value) {
  return compactNumber.format(value ?? 0);
}

export function formatNumber(value) {
  return fullNumber.format(value ?? 0);
}

export function formatUsd(value) {
  return usd.format(value ?? 0);
}

export function formatDuration(value) {
  const ms = value ?? 0;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

export function formatPercent(value, total) {
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function formatBudget(value) {
  if (value === null || value === undefined) return "Tanpa batas";
  return budgetUsd.format(value);
}

export function formatPrice(value) {
  if (value === null || value === undefined) return "Belum diatur";
  return priceUsd.format(value);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const timestamp = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(timestamp.getTime())) return value;
  return timestamp.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
