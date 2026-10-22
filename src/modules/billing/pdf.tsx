import "server-only";
import path from "node:path";
import { Document, Font, Image, Link, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BANNER_RATIO } from "@/modules/branding/banner";
import { brandColors, FONT_FAMILIES, LOGO_PDF_SIZE, type Brand } from "@/modules/branding/brand";
import type { DocumentView } from "./view";

// PDF d'un devis ou d'une facture (@react-pdf/renderer, côté serveur), à l'image de marque
// du document (couleurs, police, logo, bannière : src/modules/branding). Polices embarquées
// en sous-ensemble (SIL OFL 1.1, licences dans fonts/) : elles couvrent le signe moins
// (U+2212), l'espace fine insécable des montants (« 450 000 Ar »), les diacritiques
// combinants (n̈ malgache), € et $, contrairement à l'Helvetica intégrée (WinAnsi).
// Fichiers lus depuis le disque : next.config (outputFileTracingIncludes) les déploie.

export type Translate = (key: string, values?: Record<string, string>) => string;
export type PdfImage = { data: Buffer; format: "png" | "jpg" } | null;
export type PdfImages = { logo: PdfImage; banner: PdfImage };

// Teintes neutres communes à toutes les marques.
const C = {
  sand: "#C9C5BA",
  sandLight: "#F4F1EA",
  spray: "#E8EDF0",
  ink: "#0B2A2E",
  muted: "#45605F",
};

const fontFile = (name: string) => path.join(process.cwd(), "src/modules/billing/fonts", name);
for (const { family, files } of Object.values(FONT_FAMILIES)) {
  Font.register({
    family,
    fonts: [
      { src: fontFile(files[0]), fontWeight: 400 },
      { src: fontFile(files[1]), fontWeight: 700 },
    ],
  });
}

// Pas de césure au milieu d'un mot (noms, numéros, références).
Font.registerHyphenationCallback((word) => [word]);

// Bannière : toute la largeur de la page A4 (595 pt), au format conseillé 4:1.
const PAGE_WIDTH = 595.28;
const PAD_X = 40;
const PAD_TOP = 36;

function styles(brand: Brand) {
  const { primary, onPrimary, accent, onAccent, accentEdge } = brandColors(brand);
  const logoSize = LOGO_PDF_SIZE[brand.logoSize];
  return StyleSheet.create({
    page: { paddingTop: PAD_TOP, paddingBottom: 64, paddingHorizontal: PAD_X, fontFamily: FONT_FAMILIES[brand.font].family, fontSize: 10, color: C.ink },
    band: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: primary },
    banner: { marginTop: -PAD_TOP, marginHorizontal: -PAD_X, marginBottom: 18, width: PAGE_WIDTH, height: PAGE_WIDTH / BANNER_RATIO, objectFit: "cover" },
    logoCentered: { alignSelf: "center", marginBottom: 14 },
    header: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
    identity: { flexDirection: "row", gap: 10, flexShrink: 1, maxWidth: "58%" },
    logo: { height: logoSize, maxWidth: logoSize * 3, objectFit: "contain" },
    business: { fontWeight: 700, fontSize: 13, color: primary, marginBottom: 3 },
    small: { fontSize: 8.5, color: C.muted, lineHeight: 1.4 },
    titleBlock: { alignItems: "flex-end" },
    title: { fontWeight: 700, fontSize: 22, color: primary, letterSpacing: 1 },
    number: { fontWeight: 700, fontSize: 11, marginTop: 2, marginBottom: 6 },
    dateRow: { flexDirection: "row", gap: 6, fontSize: 9 },
    dateLabel: { color: C.muted },
    draft: {
      marginTop: 14,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: C.spray,
      color: C.ink,
      fontWeight: 700,
      fontSize: 9,
      textAlign: "center",
    },
    client: { marginTop: 18, padding: 10, borderLeftWidth: 3, borderLeftColor: accent, backgroundColor: C.sandLight },
    label: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
    clientName: { fontWeight: 700, fontSize: 11 },
    table: { marginTop: 18 },
    thead: { flexDirection: "row", backgroundColor: primary, color: onPrimary, fontWeight: 700, fontSize: 9 },
    row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.sand },
    rowAlt: { backgroundColor: C.sandLight },
    cell: { paddingVertical: 6, paddingHorizontal: 6 },
    cDesc: { flex: 1 },
    cQty: { width: 44, textAlign: "right" },
    cPrice: { width: 92, textAlign: "right" },
    cTotal: { width: 96, textAlign: "right" },
    totals: { marginTop: 10, marginLeft: "auto", width: 240 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 6 },
    grand: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
      paddingVertical: 7,
      paddingHorizontal: 6,
      backgroundColor: primary,
      color: onPrimary,
      fontWeight: 700,
      fontSize: 12,
    },
    due: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 2,
      paddingVertical: 5,
      paddingHorizontal: 6,
      backgroundColor: accent,
      color: onAccent,
      fontWeight: 700,
      ...(accentEdge && { borderWidth: 1, borderColor: accentEdge }),
    },
    box: { marginTop: 20, padding: 10, borderWidth: 0.75, borderColor: C.sand, borderRadius: 4 },
    boxTitle: { fontWeight: 700, fontSize: 10, color: primary, marginBottom: 4 },
    link: { color: primary, textDecoration: "underline" },
    stamp: { marginTop: 14, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1.5, borderColor: primary, color: primary, fontWeight: 700, fontSize: 10 },
    footer: { position: "absolute", bottom: 24, left: PAD_X, right: PAD_X, borderTopWidth: 0.5, borderTopColor: C.sand, paddingTop: 6 },
    footerRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
  });
}

function DocumentPdf({ view, t, images }: { view: DocumentView; t: Translate; images: PdfImages }) {
  const s = styles(view.brand);
  const { logo, banner } = images;
  const centered = view.brand.logoPosition === "center";
  const title = t(view.kind === "quote" ? "quoteTitle" : "invoiceTitle");
  const legal = [
    view.freelancer.nif && t("nif", { value: view.freelancer.nif }),
    view.freelancer.stat && t("stat", { value: view.freelancer.stat }),
    view.freelancer.taxRegime && t(`taxRegime.${view.freelancer.taxRegime}`),
  ].filter(Boolean);

  return (
    <Document title={`${title} ${view.number ?? ""}`.trim()} author={view.freelancer.name} creator="Ivonea OS" producer="Ivonea OS" language={t("lang")}>
      <Page size="A4" style={s.page}>
        {/* Bannière en tête de la première page ; sinon un liseré sur chaque page. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- image PDF, pas de texte alternatif HTML */}
        {banner ? <Image src={banner} style={s.banner} /> : <View style={s.band} fixed />}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- image PDF */}
        {logo && centered && <Image src={logo} style={[s.logo, s.logoCentered]} />}
        <View style={s.header}>
          <View style={s.identity}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- image PDF */}
            {logo && !centered && <Image src={logo} style={s.logo} />}
            <View style={{ flexShrink: 1 }}>
              <Text style={s.business}>{view.freelancer.name}</Text>
              {view.freelancer.address && <Text style={s.small}>{view.freelancer.address}</Text>}
              {legal.map((line) => (
                <Text key={line as string} style={s.small}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>{title.toUpperCase()}</Text>
            <Text style={s.number}>{view.number ?? t("draftNumber")}</Text>
            {view.dates.map((d) => (
              <View key={d.key} style={s.dateRow}>
                <Text style={s.dateLabel}>{t(`dates.${d.key}`)}</Text>
                <Text>{d.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {view.draft && <Text style={s.draft}>{t("draftBanner")}</Text>}

        <View style={s.client}>
          <Text style={s.label}>{t(view.kind === "quote" ? "clientQuote" : "clientInvoice")}</Text>
          <Text style={s.clientName}>{view.client.name}</Text>
          {view.client.company && <Text>{view.client.company}</Text>}
        </View>

        <View style={s.table}>
          <View style={s.thead} fixed>
            <Text style={[s.cell, s.cDesc]}>{t("columns.description")}</Text>
            <Text style={[s.cell, s.cQty]}>{t("columns.quantity")}</Text>
            <Text style={[s.cell, s.cPrice]}>{t("columns.unitPrice")}</Text>
            <Text style={[s.cell, s.cTotal]}>{t("columns.total")}</Text>
          </View>
          {view.lines.map((line, i) => (
            <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
              <Text style={[s.cell, s.cDesc]}>{line.description}</Text>
              <Text style={[s.cell, s.cQty]}>{line.quantity}</Text>
              <Text style={[s.cell, s.cPrice]}>{line.unitPrice}</Text>
              <Text style={[s.cell, s.cTotal]}>{line.total}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          {view.discount && (
            <>
              <View style={s.totalRow}>
                <Text>{t("subtotal")}</Text>
                <Text>{view.subtotal}</Text>
              </View>
              <View style={s.totalRow}>
                <Text>{t("discount")}</Text>
                <Text>− {view.discount}</Text>
              </View>
            </>
          )}
          <View style={s.grand}>
            <Text>{t("total")}</Text>
            <Text>{view.total}</Text>
          </View>
          {view.amountPaid && view.amountDue && (
            <>
              <View style={s.totalRow}>
                <Text>{t("amountPaid")}</Text>
                <Text>{view.amountPaid}</Text>
              </View>
              <View style={s.due}>
                <Text>{t("amountDue")}</Text>
                <Text>{view.amountDue}</Text>
              </View>
            </>
          )}
        </View>

        {(view.status === "paid" || view.status === "accepted" || view.status === "cancelled") && (
          <Text style={s.stamp}>{t(`stamp.${view.status}`)}</Text>
        )}

        {view.payment && (
          <View style={s.box} wrap={false}>
            <Text style={s.boxTitle}>{t("payment.title")}</Text>
            {view.payment.instructions.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            {view.payment.online && view.publicUrl && (
              <Text style={{ marginTop: 4 }}>
                {t("payment.online")}{" "}
                <Link src={view.publicUrl} style={s.link}>
                  {view.publicUrl}
                </Link>
              </Text>
            )}
          </View>
        )}

        {view.publicUrl && (
          <View style={s.box} wrap={false}>
            <Text style={s.boxTitle}>{t(view.kind === "quote" && view.status === "sent" ? "online.acceptTitle" : "online.title")}</Text>
            <Link src={view.publicUrl} style={s.link}>
              {view.publicUrl}
            </Link>
          </View>
        )}

        <View style={s.footer} fixed>
          {view.freelancer.footer && <Text style={[s.small, { marginBottom: 3 }]}>{view.freelancer.footer}</Text>}
          <View style={s.footerRow}>
            <Text>{t("madeWith")}</Text>
            <Text render={({ pageNumber, totalPages }) => t("page", { page: String(pageNumber), pages: String(totalPages) })} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(view: DocumentView, t: Translate, images: PdfImages = { logo: null, banner: null }): Promise<Buffer> {
  return renderToBuffer(<DocumentPdf view={view} t={t} images={images} />);
}
