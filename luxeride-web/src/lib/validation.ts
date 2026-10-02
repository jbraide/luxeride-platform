/** Accepts 070/080/081/090/091-prefixed local numbers, or +234 equivalents. */
export function validateNGPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  let local: string;
  if (digits.startsWith("234") && digits.length === 13) {
    local = digits.slice(3);
  } else if (digits.startsWith("0") && digits.length === 11) {
    local = digits.slice(1);
  } else {
    return false;
  }
  return ["70", "80", "81", "90", "91"].includes(local.slice(0, 2));
}
