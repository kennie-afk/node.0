export const ksh = (cents: number) => `KSh ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const toCents = (value: FormDataEntryValue | null): number => Math.round(Number(String(value ?? "0").replace(/,/g, "")) * 100) || 0;
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const dayTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** 1800 basis points -> "18%" */
export const bp = (value: number) => `${(value / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}%`;
/** Today in Nairobi, as the API counts days. */
export const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
export const label = (value: string) => {
  const words = value.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
