// Concordance entre le texte lu sur la carte fiscale (OCR) et les numéros saisis.
// Règle (docs/spec-mvp.md, « Vérification fiscale ») : sur chaque ligne lue, on garde les
// suites de chiffres en tolérant espaces, points et tirets entre les groupes, et les
// confusions courantes O→0, I/l/|→1, S→5, B→8 seulement à l'intérieur d'un groupe qui
// contient au moins autant de vrais chiffres (« NIF », « STAT », « S » seul ne deviennent
// jamais des chiffres). Le NIF ET le STAT saisis doivent tous deux figurer dans une de ces
// suites, sur l'une des faces. Le texte lu n'est jamais conservé.

const CONFUSIONS: Record<string, string> = { O: "0", I: "1", l: "1", "|": "1", S: "5", B: "8" };
// Un groupe : chiffres et lettres confondues collés ; un séparateur : espaces (dont
// insécables), points, tirets. Tout autre caractère coupe la suite.
const TOKEN = /([0-9OIl|SB]+)|([ \t.\-  ‐-—]+)|([^])/g;

function groupDigits(group: string): string | null {
  let digits = 0;
  let confusions = 0;
  for (const char of group) {
    if (char >= "0" && char <= "9") digits++;
    else confusions++;
  }
  if (digits === 0 || confusions > digits) return null;
  return [...group].map((char) => CONFUSIONS[char] ?? char).join("");
}

// Suites de chiffres d'un texte, ligne par ligne.
export function digitRuns(text: string): string[] {
  const runs: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    let run = "";
    for (const [, group, separator] of line.matchAll(TOKEN)) {
      if (separator !== undefined) continue;
      const digits = group !== undefined ? groupDigits(group) : null;
      if (digits !== null) {
        run += digits;
        continue;
      }
      if (run) runs.push(run);
      run = "";
    }
    if (run) runs.push(run);
  }
  return runs;
}

export type FiscalMatch = { nif: boolean; stat: boolean; verified: boolean };

// faces : texte lu sur chaque photo (recto, verso).
export function matchFiscalNumbers(faces: string[], numbers: { nif: string; stat: string }): FiscalMatch {
  const runs = faces.flatMap(digitRuns);
  const found = (value: string) => value.length > 0 && runs.some((run) => run.includes(value));
  const nif = /^\d{10}$/.test(numbers.nif) && found(numbers.nif);
  const stat = /^\d{17}$/.test(numbers.stat) && found(numbers.stat);
  return { nif, stat, verified: nif && stat };
}
