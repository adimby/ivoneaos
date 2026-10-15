import { createAdminClient } from "@/lib/supabase/admin";
import { whopEnabled, whopWebhookStore } from "@/modules/payments/whop/service";
import { handleWhopWebhook } from "@/modules/payments/whop/webhook";

// Un événement de paiement Whop fait quelques Ko : au-delà de 256 Ko, ce n'en est pas un.
const MAX_BODY_BYTES = 256 * 1024;

// Webhook Whop de la plateforme (événements des comptes connectés compris), signé selon
// Standard Webhooks avec WHOP_WEBHOOK_SECRET. Corps lu brut : la signature porte dessus.
export async function POST(request: Request) {
  const admin = createAdminClient();
  const secret = process.env.WHOP_WEBHOOK_SECRET?.trim();
  if (!admin || !secret || !whopEnabled()) return Response.json({ received: false, error: "unavailable" }, { status: 503 });
  const tooLarge = () => Response.json({ received: false, error: "too_large" }, { status: 413 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (rawBody.length > MAX_BODY_BYTES) return tooLarge();
  try {
    const { status, body } = await handleWhopWebhook({
      rawBody,
      headers: {
        id: request.headers.get("webhook-id"),
        timestamp: request.headers.get("webhook-timestamp"),
        signature: request.headers.get("webhook-signature"),
      },
      secret,
      store: whopWebhookStore(admin),
    });
    return Response.json(body, { status });
  } catch (error) {
    // Base indisponible : Whop réessaie plus tard.
    console.error("[whop] webhook non traité", error instanceof Error ? error.message : "");
    return Response.json({ received: false, error: "unavailable" }, { status: 503 });
  }
}
