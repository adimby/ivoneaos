import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { productionEnvErrors } from "./src/lib/production-env";

// Production (Vercel) : réglages obligatoires (adresse de contact, APP_URL) et aucune URL
// de service simulé. La construction échoue avec la liste des problèmes.
if (process.env.VERCEL_ENV === "production") {
  const errors = productionEnvErrors(process.env);
  if (errors.length) throw new Error(`Réglages de production incomplets :\n- ${errors.join("\n- ")}`);
}

// Logos : URL signées du Storage Supabase (page publique, réglages).
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// Politique de contenu sans nonce (pages statiques et Cache Components) : scripts et
// styles du site seulement (les scripts intégrés de Next restent permis), aucun plugin,
// aucune balise <base> étrangère. frame-ancestors : aucune page ne s'affiche dans un cadre
// d'un autre site (anti-clickjacking sur « J'accepte » de la page publique) ;
// X-Frame-Options pour les anciens navigateurs.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${supabaseOrigin}`.trim(),
  "font-src 'self'",
  // Photos de la carte fiscale : envoyées directement du navigateur au Storage Supabase.
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  // Formulaires (actions serveur) vers le site, plus Whop : un balisage injecté ne peut pas
  // poster ailleurs. Chrome applique form-action aussi aux redirections d'un envoi : avant le
  // chargement du JavaScript, « Connecter Whop » est un envoi natif redirigé (303) vers
  // l'inscription hébergée par Whop (account_links : https://whop.com/verify-identity/…,
  // bac à sable sur un sous-domaine). Papi n'est joint que par des liens (GET).
  "form-action 'self' https://whop.com https://*.whop.com",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Les liens publics portent un jeton : vers un autre site, seule l'origine part.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Police du PDF (lue sur le disque par @react-pdf) : déployée avec chaque fonction
  // serveur (pages publiques, aperçus, action « Envoyer la facture » qui archive le PDF).
  outputFileTracingIncludes: {
    "/*": ["src/modules/billing/fonts/*.ttf"],
    // Lecture de la carte fiscale (tesseract.js, hors bundle) : script du worker lancé par
    // chemin (worker_threads), moteur WebAssembly LSTM et modèle anglais lus sur le disque.
    "/api/fiscal/verification": [
      "node_modules/tesseract.js/package.json",
      "node_modules/tesseract.js/src/**/*.js",
      "node_modules/tesseract.js-core/package.json",
      "node_modules/tesseract.js-core/tesseract-core*.wasm",
      "node_modules/tesseract.js-core/tesseract-core{,-simd,-relaxedsimd}{,-lstm}.js",
      "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
      "node_modules/{bmp-js,idb-keyval,is-url,regenerator-runtime,wasm-feature-detect,zlibjs}/**/*",
    ],
  },
  // Chemins relatifs à son dossier (worker, moteur) : chargé par require, jamais empaqueté.
  serverExternalPackages: ["tesseract.js"],
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // PDF (aperçus, page publique) : le lecteur PDF du navigateur ne supporte pas une
      // politique stricte ; seul l'anti-cadre reste.
      ...["/:locale/p/:token/pdf", "/:locale/devis/:id/apercu", "/:locale/factures/:id/apercu", "/:locale/reglages/image-de-marque/apercu"].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      })),
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
