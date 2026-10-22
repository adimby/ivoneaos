import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { brandSnapshot } from "@/modules/branding/brand";
import { quoteDocument } from "@/modules/billing/document";
import { documentPdf, pdfResponse } from "@/modules/billing/render";
import { getCurrentWorkspace } from "@/modules/workspace/queries";

// PDF d'exemple (Réglages > Image de marque) : un devis fictif à l'image de marque
// enregistrée, avec le profil de la freelance. Rien n'est écrit en base.
export async function GET(_request: Request, { params }: RouteContext<"/[locale]/reglages/image-de-marque/apercu">) {
  const { locale: raw } = await params;
  const locale: Locale = (routing.locales as readonly string[]).includes(raw) ? (raw as Locale) : routing.defaultLocale;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return new Response("Unauthorized", { status: 401 });
  const t = await getTranslations({ locale, namespace: "Branding.sample" });
  const lines = [
    { description: t("line1"), quantity: 1, unit_price: 450000, line_total: 450000 },
    { description: t("line2"), quantity: 2, unit_price: 75000, line_total: 150000 },
  ];
  const doc = quoteDocument(
    {
      number: `D-${new Date().getFullYear()}-0001`,
      status: "sent",
      language: locale,
      currency: "MGA",
      valid_until: null,
      sent_at: new Date().toISOString(),
      accepted_at: null,
      subtotal: 600000,
      discount: 0,
      total: 600000,
    },
    {
      freelancer: {
        business_name: workspace.name,
        logo_path: workspace.logo_path,
        nif: workspace.nif,
        stat: workspace.stat,
        tax_regime: workspace.tax_regime,
        address: workspace.address,
        invoice_footer: workspace.invoice_footer,
        brand: brandSnapshot(workspace),
      },
      client: { name: t("client"), company_name: t("company") },
      lines,
      manualInstructions: null,
    },
  );
  const pdf = await documentPdf(doc, { publicUrl: null, logoAs: "member" });
  return pdfResponse(pdf, doc, false);
}
