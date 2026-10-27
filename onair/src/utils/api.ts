/**
 * The ORM returns timestamp columns as Temporal.Instant values, which JSON
 * serializers cannot handle directly. Convert them to ISO 8601 strings.
 */
export function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
