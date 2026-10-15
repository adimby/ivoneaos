import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { ivoneaContactEmail } from "./src/lib/contact-email";

// Production (Vercel) : l'adresse de contact d'Ivonea est obligatoire. Sans elle,
// Réglages > Offre n'aurait aucun bouton pour changer d'offre, et une freelance arrivée
// à la limite de l'offre Découverte resterait bloquée.
if (process.env.VERCEL_ENV === "production" && !ivoneaContactEmail()) {
  throw new Error("IVONEA_CONTACT_EMAIL manquante ou invalide : obligatoire en production (Réglages > Offre).");
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Police du PDF (lue sur le disque par @react-pdf) : déployée avec chaque fonction
  // serveur (pages publiques, aperçus, action « Envoyer la facture » qui archive le PDF).
  outputFileTracingIncludes: {
    "/*": ["src/modules/billing/fonts/*.ttf"],
  },
  // Anti-clickjacking : aucune page ne s'affiche dans un cadre d'un autre site (la page
  // publique porte « J'accepte »). frame-ancestors pour les navigateurs récents,
  // X-Frame-Options pour les anciens.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  experimental: {
    // Logo jusqu'à 1 Mo envoyé par action serveur, plus le reste du formulaire.
    serverActions: { bodySizeLimit: "2mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
