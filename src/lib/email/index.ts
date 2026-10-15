import "server-only";
// Envoi d'e-mails par l'API HTTP de Resend (https://resend.com/docs/api-reference/emails/send-email).
// Sans RESEND_API_KEY : rien n'est envoyé, un message l'indique dans les journaux.
const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Ivonea OS <notifications@ivonea.com>";

// skipped : envoi désactivé (pas de clé).
export type SendResult = "sent" | "skipped" | "failed";

export type Email = { to: string; subject: string; text: string; html: string };

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
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email.to],
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
