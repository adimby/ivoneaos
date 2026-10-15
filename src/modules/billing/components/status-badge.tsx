import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { STATUS_TONE, type InvoiceStatus, type QuoteStatus } from "../status";

export function StatusBadge(
  props: ({ kind: "quote"; status: QuoteStatus } | { kind: "invoice"; status: InvoiceStatus }) & { className?: string },
) {
  const t = useTranslations("Billing.status");
  return (
    <Badge tone={STATUS_TONE[props.status]} className={props.className} data-testid="document-status">
      {t(`${props.kind}.${props.status}`)}
    </Badge>
  );
}
