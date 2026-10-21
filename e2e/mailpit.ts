// Lecture des e-mails capturés par Mailpit (Supabase local) : codes de connexion d'Auth,
// et e-mails de l'application remis par le Resend simulé (e2e/resend-mock.mjs).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MessageSummary = { ID: string; Created: string; Subject: string };
export type Message = {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
  From: { Name: string; Address: string };
  ReplyTo: { Address: string }[] | null;
};

// Premier e-mail reçu par `email` après `since` qui satisfait `match` (le plus récent d'abord).
export async function readEmail(
  email: string,
  since: Date,
  match: (message: Message) => boolean = () => true,
  timeoutMs = 15_000,
): Promise<Message> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as { messages: MessageSummary[] };
      for (const summary of messages.filter((m) => new Date(m.Created) >= since)) {
        const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${summary.ID}`)).json()) as Message;
        if (match(message)) return message;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Aucun e-mail attendu reçu pour ${email}`);
}

// Dernier code (6 à 10 chiffres) reçu par `email` après `since` (e-mail de connexion seulement).
export async function readOtp(email: string, since: Date, timeoutMs = 15_000): Promise<string> {
  const message = await readEmail(email, since, (m) => /Ivonea OS code/.test(m.Subject) && /\b\d{6,10}\b/.test(m.Text), timeoutMs);
  return message.Text.match(/\b(\d{6,10})\b/)![1];
}
