export const RANGES = [
  { id: "24h", label: "24H", hours: 24 },
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
];

export const DEFAULT_RANGE = "7d";

export function rangeFromId(id) {
  return RANGES.find((range) => range.id === id) ?? RANGES[1];
}

export function rangeParams(rangeId) {
  const range = rangeFromId(rangeId);
  return range.hours ? { hours: range.hours } : { days: range.days };
}

export function rangeLabel(rangeId) {
  const range = rangeFromId(rangeId);
  return range.hours ? "24 jam terakhir" : `${range.days} hari terakhir`;
}

export function rangeWindowLabel(rangeId) {
  const range = rangeFromId(rangeId);
  return range.hours ? "vs 24 jam sebelumnya" : `vs ${range.days} hari sebelumnya`;
}
