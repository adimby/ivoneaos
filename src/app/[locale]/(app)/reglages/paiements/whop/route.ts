import { refreshWhopStatus } from "@/modules/payments/whop/service";
import { getCurrentWorkspace, isOnboarded } from "@/modules/workspace/queries";

// Retour de l'inscription Whop : statut du compte relu chez Whop, puis retour aux
// réglages de paiement avec le résultat (?whop=connected|pending|unavailable).
export async function GET(_request: Request, { params }: RouteContext<"/[locale]/reglages/paiements/whop">) {
  const { locale } = await params;
  const prefix = `/${locale === "en" ? "en" : "fr"}`;
  // Adresse relative : même hôte que la requête (request.nextUrl peut le réécrire).
  const to = (path: string) => new Response(null, { status: 303, headers: { Location: `${prefix}${path}`, "Cache-Control": "private, no-store" } });

  // Session et workspace vérifiés (le proxy protège déjà /reglages).
  const workspace = await getCurrentWorkspace();
  if (!workspace || !isOnboarded(workspace)) return to("/demarrage");
  let result: string;
  try {
    result = await refreshWhopStatus(workspace.id);
  } catch (error) {
    console.error("[whop] statut non relu", error instanceof Error ? error.message : "");
    result = "error";
  }
  return to(`/reglages/paiements?whop=${result}`);
}
