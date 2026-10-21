import type { NextRequest } from "next/server";
import { appOrigin } from "@/lib/app-url";
import { getPayableInvoiceByToken, payableInvoice } from "@/modules/billing/payment-link";
import { ensureInvoicePapiLink } from "@/modules/payments/papi/service";

// « Payer avec Papi » depuis la page publique : redirige vers le lien Papi de la facture,
// recréé à la demande s'il a expiré (nouvelle tentative IVN-<facture>-<n>). Payé entre-temps
// ou paiement en ligne indisponible : retour à la page, qui l'explique.
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/p/[token]/payer">) {
  const { locale, token } = await params;
  const page = `/${locale === "en" ? "en" : "fr"}/p/${token}`;
  const back = async (query?: string) => redirect(new URL(query ? `${page}?${query}` : page, await appOrigin()).toString());

  let row;
  try {
    row = await getPayableInvoiceByToken(token);
  } catch (error) {
    console.error("[papi] facture non lue", error instanceof Error ? error.message : "");
    return back("paiement=indisponible");
  }
  if (!row) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });

  const origin = await appOrigin();
  try {
    const outcome = await ensureInvoicePapiLink(payableInvoice(row, origin), { origin });
    if (outcome.status === "ready") return redirect(outcome.url);
    if (outcome.status === "paid") return back();
  } catch (error) {
    console.error("[papi] lien non préparé", error instanceof Error ? error.message : "");
  }
  return back("paiement=indisponible");
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
