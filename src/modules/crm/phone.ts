// Numéros de téléphone : enregistrés au format international compact (+261341234567),
// affichés groupés (+261 34 12 345 67). Madagascar d'abord : « 034 12 345 67 »,
// « 34 12 345 67 », « 261 34… », « +261 34… » ou « 00261 34… » donnent le même numéro.
// Un numéro étranger se saisit avec son indicatif (+33…, 0033…).

const MG = "261";

// null : numéro invalide (trop court, trop long, lettres).
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (/[^\d\s.\-()+/  ]/.test(raw)) return null;
  const plus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!plus && digits.startsWith("00")) digits = digits.slice(2);
  else if (!plus && !digits.startsWith(MG)) {
    // Numéro national malgache : 0 + 9 chiffres, ou les 9 chiffres sans le 0.
    if (/^0\d{9}$/.test(digits)) digits = MG + digits.slice(1);
    else if (/^[23]\d{8}$/.test(digits)) digits = MG + digits;
    else return null;
  }
  if (digits.startsWith(MG)) {
    // +261 0 34… : le 0 national saisi en trop.
    if (/^2610\d{9}$/.test(digits)) digits = MG + digits.slice(4);
    return /^261[23]\d{8}$/.test(digits) ? `+${digits}` : null;
  }
  // E.164 : 8 à 15 chiffres, indicatif sans 0 initial.
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

// Longueur de l'indicatif pays (plan E.164 de l'UIT) : 1 chiffre pour 1 (Amérique du
// Nord) et 7, 2 chiffres pour les indicatifs listés, 3 chiffres sinon.
const TWO_DIGIT_CODES = new Set(
  "20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98".split(" "),
);
function countryCodeLength(digits: string): number {
  if (digits[0] === "1" || digits[0] === "7") return 1;
  return TWO_DIGIT_CODES.has(digits.slice(0, 2)) ? 2 : 3;
}

// Affichage : +261 34 12 345 67 pour Madagascar ; à l'étranger, l'indicatif puis le
// numéro par blocs de 2 chiffres depuis la fin (+33 6 12 34 56 78), 3-3-4 en Amérique
// du Nord (+1 202 555 0123).
export function formatPhone(phone: string): string {
  const mg = /^\+261(\d{2})(\d{2})(\d{3})(\d{2})$/.exec(phone);
  if (mg) return `+261 ${mg[1]} ${mg[2]} ${mg[3]} ${mg[4]}`;
  if (!/^\+\d{8,15}$/.test(phone)) return phone;
  const digits = phone.slice(1);
  const codeLength = countryCodeLength(digits);
  const code = digits.slice(0, codeLength);
  const national = digits.slice(codeLength);
  const nanp = /^(\d{3})(\d{3})(\d{4})$/.exec(national);
  if (code === "1" && nanp) return `+1 ${nanp[1]} ${nanp[2]} ${nanp[3]}`;
  const blocks: string[] = [];
  for (let end = national.length; end > 0; end -= 2) blocks.unshift(national.slice(Math.max(0, end - 2), end));
  return `+${code} ${blocks.join(" ")}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// Lien WhatsApp : https://wa.me/<indicatif + numéro, chiffres seulement>.
export function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

// Recherche : chiffres d'un numéro saisi « 034 12 », sans le 0 national ni l'indicatif,
// pour retrouver « +26134 12… ». null si la saisie ne contient pas assez de chiffres.
export function phoneSearchDigits(query: string): string | null {
  let digits = query.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(MG)) digits = digits.slice(3);
  digits = digits.replace(/^0/, "");
  return digits.length >= 2 ? digits : null;
}
