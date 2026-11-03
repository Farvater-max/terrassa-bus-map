/** Converts a GTFS YYYYMMDD date string to YYYY-MM-DD. */
export function toISODate(value) {
  if (!value) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
