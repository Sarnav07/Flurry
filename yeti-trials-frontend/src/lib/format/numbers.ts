/**
 * BigInt-safe formatting. A `u64` is NEVER routed through a JS `number`.
 * `formatU64` is the canonical, round-trippable decimal form; `formatU64Grouped`
 * adds locale-style separators for display only (not round-trippable).
 */

/** Canonical base-10 string. Round-trips exactly via `toU64`/`BigInt`. */
export function formatU64(value: bigint): string {
  return value.toString(10);
}

/** Thousands-grouped decimal for display. String-only; never uses `Number`. */
export function formatU64Grouped(value: bigint, separator = ','): string {
  return formatU64(value).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}
