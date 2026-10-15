// Recherche des contacts dans un filtre PostgREST « or(...) ».

// Saisie nettoyée : * est le joker de PostgREST (jamais cherché tel quel), espaces réduits.
export function searchTerm(query: string): string {
  return query.replace(/\*/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

// Valeur « contient » d'un filtre ilike : % et _ échappés (sinon jokers SQL), puis entre
// guillemets (\ et " échappés) pour que parenthèses, virgules et points soient cherchés
// tels quels.
export function containsPattern(term: string): string {
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `"*${like.replace(/[\\"]/g, (c) => `\\${c}`)}*"`;
}
