import type { NextRequest } from "next/server";
import { appOrigin } from "@/lib/app-url";
import { getPublicDocument } from "@/modules/billing/queries";
import { pdfResponse, publicDocumentPdf } from "@/modules/billing/render";
import { publicPath } from "@/modules/billing/share";

// PDF d'un document émis, pour le client (sans compte) : même jeton que la page publique,
// dans la langue du document. ?telecharger : en pièce jointe.
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/p/[token]/pdf">) {
  const { token } = await params;
  const found = await getPublicDocument(token);
  if (!found) {
    return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  const url = `${await appOrigin()}${publicPath(found.doc.language, token)}`;
  const pdf = await publicDocumentPdf(found.doc, url);
  return pdfResponse(pdf, found.doc, request.nextUrl.searchParams.has("telecharger"));
}
