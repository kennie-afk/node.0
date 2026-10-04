/** Evidence keys arrive as camelCase or snake_case and numbers as raw floats; show them as an owner would write them. */
export function evidenceLabel(key: string): string {
  const words = key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function evidenceValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-KE") : (Math.round(value * 100) / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 });
  return String(value);
}
