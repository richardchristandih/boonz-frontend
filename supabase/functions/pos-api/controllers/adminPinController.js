// controllers/adminPinController.js
import { issuePin } from "../utils/adminPin.js";
import { sendMail } from "../services/mailer.js";

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

export const sendAdminPin = async (req, res, next) => {
  try {
    if (!ADMIN_EMAIL) {
      return res
        .status(500)
        .json({ message: "ADMIN_EMAIL is not configured on the server." });
    }

    // Rate-limited/TTL controlled in issuePin()
    const { code, ttlMs, cooldownMs } = await issuePin();

    const subject = "Boonz — Admin Registration PIN";
    const ttlMin = Math.round(ttlMs / 60000);
    const text = `Your admin PIN is: ${code}
This PIN expires in ${ttlMin} minutes and is single-use.

If you did not request this, you can ignore this email.`;
    const html = `<p>Your admin PIN is: <b style="font-size:18px">${code}</b></p>
<p>This PIN expires in <b>${ttlMin} minutes</b> and is single-use.</p>
<p>If you did not request this, you can ignore this email.</p>`;

    await sendMail({
      to: ADMIN_EMAIL,
      subject,
      text,
      html,
    });

    res.json({
      ok: true,
      message: "Admin PIN sent.",
      cooldownSec: Math.ceil(cooldownMs / 1000),
      ttlSec: Math.ceil(ttlMs / 1000),
      // Do NOT return the code in production. In dev, the mailer may log it.
    });
  } catch (err) {
    next(err);
  }
};
