import type { NextRequest } from "next/server";
import { publicAppUrl } from "@/lib/app-url";
import { getPayableInvoiceByToken, payableInvoice } from "@/modules/billing/payment-link";
import { ensureInvoiceWhopLink } from "@/modules/payments/whop/service";

// « Payer par carte » (factures EUR/USD) depuis la page publique : redirige vers le
// paiement Whop de la facture, recréé si le reste dû a changé. Indisponible : retour à la
// page, qui l'explique.
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/p/[token]/carte">) {
  const { locale, token } = await params;
  const page = `/${locale === "en" ? "en" : "fr"}/p/${token}`;
  const back = (query?: string) => redirect(new URL(query ? `${page}?${query}` : page, request.nextUrl.origin).toString());

  let row;
  try {
    row = await getPayableInvoiceByToken(token);
  } catch (error) {
    console.error("[whop] facture non lue", error instanceof Error ? error.message : "");
    return back("paiement=indisponible");
  }
  if (!row) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });

  const origin = publicAppUrl() ?? request.nextUrl.origin;
  try {
    const outcome = await ensureInvoiceWhopLink(payableInvoice(row, origin), { origin });
    if (outcome.status === "ready") return redirect(outcome.url);
  } catch (error) {
    console.error("[whop] lien non préparé", error instanceof Error ? error.message : "");
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
