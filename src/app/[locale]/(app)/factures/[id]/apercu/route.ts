import { appOrigin } from "@/lib/app-url";
import type { NextRequest } from "next/server";
import { appPdfResponse } from "@/modules/billing/render";

// Aperçu PDF (facture, brouillon compris) ; ?telecharger : en pièce jointe.
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/factures/[id]/apercu">) {
  const { id } = await params;
  return appPdfResponse("invoice", id, {
    origin: await appOrigin(),
    download: request.nextUrl.searchParams.has("telecharger"),
  });
}
