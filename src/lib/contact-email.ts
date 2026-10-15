// Adresse de contact d'Ivonea pour changer d'offre (IVONEA_CONTACT_EMAIL). Pas de paiement
// en ligne au MVP : le plan est changé à la main. Lue par Réglages > Offre et vérifiée à la
// construction de production (next.config.ts) : sans elle, la freelance n'aurait aucun
// moyen de joindre Ivonea depuis l'app.
export function ivoneaContactEmail(value = process.env.IVONEA_CONTACT_EMAIL): string | null {
  const email = value?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
