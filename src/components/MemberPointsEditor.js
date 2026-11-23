import React, { useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { adjustPoints, memberError } from "../services/membership";

export default function MemberPointsEditor({ member, onClose, onSaved }) {
  const [currentPoints, setCurrentPoints] = useState(member.points);
  const [points, setPoints] = useState(String(Math.max(0, member.points)));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const target = Number(points);
  const valid = points !== "" && Number.isSafeInteger(target) && target >= 0 &&
    target !== currentPoints && Boolean(reason.trim());

  function close() {
    if (!saving.current) onClose();
  }

  async function save(event) {
    event.preventDefault();
    if (!valid || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      onSaved(await adjustPoints(member.id, { points: target, expectedPoints: currentPoints, reason: reason.trim() }));
    } catch (failure) {
      const latest = failure.response?.data?.member;
      if (failure.response?.status === 409 && latest) {
        setCurrentPoints(latest.points);
      }
      setError(memberError(failure, "Couldn’t save the adjustment. Try again."));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const delta = target - currentPoints;
  return (
    <div className="paymodal" role="dialog" aria-modal="true" aria-labelledby="points-editor-title"
      onClick={close} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <form className="paymodal__dialog" onSubmit={save} onClick={(event) => event.stopPropagation()}>
        <header className="paymodal__head">
          <h3 id="points-editor-title">Adjust points for {member.name}</h3>
          <button type="button" className="paymodal__close" aria-label="Close" onClick={close} disabled={busy}><FiX /></button>
        </header>
        <div className="paymodal__body points-editor-fields">
          <p role="status">Current balance: <strong>{currentPoints.toLocaleString()} points</strong></p>
          <label className="member-field">New balance
            <input className="register-input" type="number" min="0" max={Number.MAX_SAFE_INTEGER}
              step="1" value={points} onChange={(event) => setPoints(event.target.value)} required disabled={busy} autoFocus />
          </label>
          {valid && <p className="member-muted">Adjustment: {delta > 0 ? "+" : ""}{delta.toLocaleString()} points</p>}
          <label className="member-field">Reason for adjustment
            <input className="register-input" value={reason} onChange={(event) => setReason(event.target.value)}
              maxLength={240} required disabled={busy} />
          </label>
          {error && <p className="member-error" role="alert">{error}</p>}
        </div>
        <footer className="paymodal__actions">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !valid}>{busy ? "Saving…" : "Save points"}</button>
        </footer>
      </form>
    </div>
  );
}
