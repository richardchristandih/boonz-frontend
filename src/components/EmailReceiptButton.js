// src/components/EmailReceiptButton.jsx
import React, { useEffect, useState } from "react";
import { sendOrderEmail, EMAIL_COOLDOWN_SEC } from "../services/orderEmail";

export default function EmailReceiptButton({
  orderId,
  initialEmail = "",
  className = "",
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((cooldownUntil - nowTs) / 1000));

  const handleSend = async () => {
    if (sending || left > 0) return;
    setMsg("");
    setErr("");
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setErr("Please enter a valid email.");
      return;
    }
    setSending(true);
    try {
      await sendOrderEmail(orderId, email);
      setMsg(`Receipt sent to ${email}.`);
      setCooldownUntil(Date.now() + EMAIL_COOLDOWN_SEC * 1000);
    } catch (e) {
      setErr("Failed to send email. Please try again.");
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="email"
          placeholder="customer@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          className={className}
          onClick={handleSend}
          disabled={sending || left > 0}
        >
          {sending
            ? "Sending…"
            : left > 0
            ? `Resend in ${left}s`
            : "Email Receipt"}
        </button>
      </div>
      {msg && <div style={{ color: "#116a36", marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ color: "#b91c1c", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
