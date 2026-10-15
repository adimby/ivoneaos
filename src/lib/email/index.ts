import "server-only";
// Envoi d'e-mails par l'API HTTP de Resend (https://resend.com/docs/api-reference/emails/send-email).
// Sans RESEND_API_KEY : rien n'est envoyé, un message l'indique dans les journaux.
const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Ivonea OS <notifications@ivonea.com>";

// skipped : envoi désactivé (pas de clé).
export type SendResult = "sent" | "skipped" | "failed";

// fromName : nom affiché devant « via Ivonea OS » (document d'une freelance) ;
// replyTo : où arrive la réponse du destinataire (la freelance, pas Ivonea).
export type Email = { to: string; subject: string; text: string; html: string; fromName?: string; replyTo?: string };

// Expéditeur « <Nom> via Ivonea OS <adresse> » : même adresse (domaine vérifié), nom entre
// guillemets, échappé (guillemets, barres obliques inverses, retours à la ligne retirés).
export function fromHeader(base: string, fromName?: string): string {
  if (!fromName) return base;
  const address = /<([^>]+)>/.exec(base)?.[1] ?? base.trim();
  const name = `${fromName} via Ivonea OS`.replace(/[\r\n]+/g, " ").replace(/(["\\])/g, "\\$1");
  return `"${name}" <${address}>`;
}

export async function sendEmail(email: Email): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] RESEND_API_KEY absente : e-mail « ${email.subject} » non envoyé.`);
    return "skipped";
  }
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromHeader(process.env.EMAIL_FROM || DEFAULT_FROM, email.fromName),
        to: [email.to],
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return "sent";
    console.error(`[email] Resend a refusé l'envoi (${response.status}) : ${await response.text()}`);
    return "failed";
  } catch (error) {
    console.error("[email] Resend injoignable", error);
    return "failed";
  }
}
