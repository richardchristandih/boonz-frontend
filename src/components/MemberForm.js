import React, { useState } from "react";
import { memberError, saveMember } from "../services/membership";

export default function MemberForm({ member, onSaved, onCancel, onBusyChange, disabled = false }) {
  const [fields, setFields] = useState({
    name: member?.name || "",
    email: member?.email || "",
    phone: member?.phone || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      onSaved(await saveMember(fields, member?.id));
    } catch (failure) {
      setError(memberError(failure, "Couldn’t save this member. Try again."));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const change = (event) => {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
  };

  return (
    <form className="member-form" onSubmit={submit}>
      <fieldset disabled={busy || disabled}>
        <div className="member-fields">
          <label>Name
            <input className="register-input" name="name" value={fields.name} onChange={change}
              autoComplete="name" required maxLength={120} />
          </label>
          <label>Email
            <input className="register-input" type="email" name="email" value={fields.email} onChange={change}
              autoComplete="email" required maxLength={254} />
          </label>
          <label>Phone number
            <input className="register-input" type="tel" name="phone" value={fields.phone} onChange={change}
              autoComplete="tel" required maxLength={30} placeholder="08… or +62…" />
          </label>
        </div>
        {error && <p className="member-error" role="alert">{error}</p>}
        <div className="member-actions">
          <button type="submit" className="member-button primary">{busy ? "Saving…" : member ? "Save changes" : "Register member"}</button>
          {onCancel && <button type="button" className="member-button" onClick={onCancel}>Cancel</button>}
        </div>
      </fieldset>
    </form>
  );
}
