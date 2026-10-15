import { createAdminClient } from "@/lib/supabase/admin";
import { papi } from "@/modules/payments/papi/adapter";
import { handlePapiNotification } from "@/modules/payments/papi/notification";
import { notificationStore } from "@/modules/payments/papi/service";

// Une notification Papi fait moins d'1 Ko : au-delà de 8 Ko, ce n'en est pas une.
const MAX_BODY_BYTES = 8 * 1024;

// Notification de paiement envoyée par Papi (une seule fois, signée X-Papi-Signature).
// Corps lu brut, sans parsing préalable : la signature porte sur les octets exacts.
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) return Response.json({ received: false, error: "unavailable" }, { status: 503 });
  const tooLarge = () => Response.json({ received: false, error: "too_large" }, { status: 413 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (rawBody.length > MAX_BODY_BYTES) return tooLarge();
  try {
    const { status, body } = await handlePapiNotification({
      rawBody,
      signature: request.headers.get("x-papi-signature"),
      store: notificationStore(admin),
      provider: papi,
    });
    return Response.json(body, { status });
  } catch (error) {
    // Base ou clé de chiffrement indisponible : Papi la marque en échec, le rattrapage
    // quotidien relira le lien.
    console.error("[papi] notification non traitée", error instanceof Error ? error.message : "");
    return Response.json({ received: false, error: "unavailable" }, { status: 503 });
  }
}
