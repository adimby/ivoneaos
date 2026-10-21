// Resend simulé pour les tests de bout en bout : même chemin et même corps que l'API
// officielle (https://resend.com/docs/api-reference/emails/send-email), chaque e-mail est
// remis à Mailpit (API d'envoi HTTP, /api/v1/send) pour que le test le lise comme un vrai.
// L'application le joint via RESEND_API_BASE_URL (playwright.config.ts).
//   Clé valide : « re_e2e_… ». Autre clé : 401.
import { createServer } from "node:http";

const port = Number(process.env.RESEND_MOCK_PORT ?? 3197);
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

// « "Studio Hery via Ivonea OS" <n@ivonea.com> » ou « n@ivonea.com » → { Email, Name }.
function address(value) {
  const match = /^\s*(?:"?((?:[^"\\]|\\.)*?)"?\s*)?<([^>]+)>\s*$/.exec(value);
  if (!match) return { Email: value.trim() };
  return { Email: match[2], Name: (match[1] ?? "").replace(/\\(.)/g, "$1") };
}

createServer(async (req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  if (path === "/__mock/health") return send(res, 200, { ok: true });
  if (path !== "/emails" || req.method !== "POST") return send(res, 404, { name: "not_found" });
  if (!/^Bearer re_e2e_/.test(req.headers.authorization ?? "")) {
    return send(res, 401, { statusCode: 401, name: "validation_error", message: "API key is invalid" });
  }
  let email;
  try {
    email = JSON.parse(await readBody(req));
  } catch {
    return send(res, 422, { name: "validation_error", message: "Invalid JSON" });
  }
  const to = Array.isArray(email.to) ? email.to : [email.to];
  if (!email.from || !email.subject || to.length === 0) return send(res, 422, { name: "missing_required_field" });
  const replyTo = email.reply_to ? (Array.isArray(email.reply_to) ? email.reply_to : [email.reply_to]) : [];
  const delivered = await fetch(`${mailpit}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: address(email.from),
      To: to.map((a) => ({ Email: a })),
      ReplyTo: replyTo.map((a) => ({ Email: a })),
      Subject: email.subject,
      Text: email.text ?? "",
      HTML: email.html ?? "",
    }),
  }).catch(() => null);
  if (!delivered?.ok) return send(res, 500, { name: "application_error", message: "Mailpit unreachable" });
  const { ID } = await delivered.json();
  return send(res, 200, { id: ID });
}).listen(port, "127.0.0.1", () => console.log(`Resend simulé sur http://127.0.0.1:${port}`));
