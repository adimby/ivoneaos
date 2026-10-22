import { appOrigin } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";
import { submitFiscalDocuments } from "@/modules/verification/service";

// Dépôt de la carte fiscale : les deux photos sont déjà dans le bucket privé (envoi direct
// du navigateur), le corps ne contient que leurs chemins. La lecture automatique se fait
// pendant la requête (le navigateur affiche « Vérification en cours… ») : un seul aller-
// retour, aucun état à suivre ensuite, et une durée bornée. Choix plutôt que after() :
// avec after(), l'écran devrait interroger le serveur pour connaître le résultat ; ici la
// réponse le donne. Lecture arrêtée à 40 s (OCR_TIMEOUT_MS) : la demande passe alors en
// vérification manuelle, toujours sous la limite de la fonction.
export const maxDuration = 60;

const MAX_BODY_BYTES = 2 * 1024;

export async function POST(request: Request) {
  // Même origine seulement (les cookies de session partiraient avec une requête d'un autre
  // site ; un formulaire ne peut pas envoyer de JSON, et ce contrôle couvre le reste).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || originHost(origin) !== host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "files_invalid" }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "files_invalid" }, { status: 413 });
  let body: { front?: unknown; back?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "files_invalid" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return Response.json({ error: "not_authenticated" }, { status: 401 });
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, name, onboarded_at, fiscal_status")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: "unknown" }, { status: 500 });
  if (!workspace?.onboarded_at) return Response.json({ error: "not_authenticated" }, { status: 401 });

  // Workspace lu avec le client de la personne (RLS : membre seulement) ; la suite passe
  // par le serveur (dépôt réservé au rôle secret).
  const result = await submitFiscalDocuments(workspace, { front: body?.front, back: body?.back }, await appOrigin());
  if ("error" in result) {
    const status = result.error === "unavailable" ? 503 : result.error === "unknown" ? 500 : 422;
    return Response.json(result, { status });
  }
  return Response.json(result);
}

// new URL plutôt que URL.parse (Node 20.18+ seulement ; Next 16 accepte Node 20.9).
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
