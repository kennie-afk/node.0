/** Whole shillings read without decimals; anything with cents always shows both digits ("61,031.50", never "61,031.5"). */
export const ksh = (cents: number) => {
  // integer arithmetic only: no float division of money
  const abs = BigInt(Math.abs(Math.round(cents)));
  const frac = String(abs % 100n).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}KSh ${(abs / 100n).toLocaleString("en-KE")}${frac === "00" ? "" : `.${frac}`}`;
};
/** "1,234.5" -> 123450. Read as text, so no float multiplication; a third decimal rounds half up. */
export const toCents = (value: FormDataEntryValue | null): number => {
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(value ?? "0").replace(/[,\s]/g, ""));
  if (!match) return 0;
  const [, sign, whole = "", fraction = ""] = match;
  const thousandths = Number((fraction + "000").slice(0, 3));
  const cents = Number(whole || "0") * 100 + Math.floor((thousandths + 5) / 10);
  return sign ? -cents : cents;
};
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
