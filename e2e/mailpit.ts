// Lecture des e-mails d'Auth capturés par Mailpit (Supabase local).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MessageSummary = { ID: string; Created: string };

// Dernier code à 6 chiffres reçu par `email` après `since`.
export async function readOtp(email: string, since: Date, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as { messages: MessageSummary[] };
      const latest = messages.find((m) => new Date(m.Created) >= since);
      if (latest) {
        const message = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
        const { Text } = (await message.json()) as { Text: string };
        const code = Text.match(/\b(\d{6})\b/)?.[1];
        if (code) return code;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Aucun code reçu pour ${email}`);
}
