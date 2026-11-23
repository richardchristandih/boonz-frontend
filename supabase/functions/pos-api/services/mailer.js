export async function sendMail({ to, subject, html, text, replyTo }) {
  const apiKey = Deno.env.get("SENDGRID_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  const reply = replyTo || Deno.env.get("MAIL_REPLY_TO");
  if (!apiKey || !from || !reply) throw new Error("Receipt email is not configured.");

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [to].flat().map((email) => ({ email })) }],
      from: { email: from },
      reply_to: { email: reply },
      subject,
      content: [
        ...(text ? [{ type: "text/plain", value: text }] : []),
        ...(html ? [{ type: "text/html", value: html }] : []),
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`SendGrid returned HTTP ${response.status}`);
  }
}
