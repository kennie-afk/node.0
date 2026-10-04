/** Whole shillings read without decimals; anything with cents always shows both digits ("61,031.50", never "61,031.5"). */
export const ksh = (cents: number) => {
  const fraction = Math.round(cents) % 100 === 0 ? 0 : 2;
  return `${cents < 0 ? "-" : ""}KSh ${(Math.abs(cents) / 100).toLocaleString("en-KE", { minimumFractionDigits: fraction, maximumFractionDigits: fraction })}`;
};
export const toCents = (value: FormDataEntryValue | null): number => Math.round(Number(String(value ?? "0").replace(/,/g, "")) * 100) || 0;
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const dayTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
