import type { NextRequest } from "next/server";
import { appPdfResponse } from "@/modules/billing/render";

// Aperçu PDF (devis, brouillon compris) ; ?telecharger : en pièce jointe.
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/devis/[id]/apercu">) {
  const { id } = await params;
  return appPdfResponse("quote", id, {
    origin: request.nextUrl.origin,
    download: request.nextUrl.searchParams.has("telecharger"),
  });
}
