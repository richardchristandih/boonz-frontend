import React, { useEffect, useRef, useState } from "react";
import { memberError, searchMembers } from "../services/membership";

export default function MemberSearch({ onSelect, onBusyChange }) {
  const [identifier, setIdentifier] = useState("");
  const [matches, setMatches] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function search(event) {
    event.preventDefault();
    if (activeRequest.current || identifier.trim().length < 2) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    onBusyChange?.(true);
    setMatches(null);
    setError("");
    try {
      const result = await searchMembers(identifier.trim(), { signal: controller.signal });
      if (!controller.signal.aborted) setMatches(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(memberError(failure, "Couldn’t find members. Try again."));
    } finally {
      activeRequest.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  return (
    <>
      <form className="member-lookup" onSubmit={search}>
        <label className="member-field">Name, email, or phone number
          <input className="register-input" value={identifier} onChange={(event) => {
            setIdentifier(event.target.value);
            setMatches(null);
          }} minLength={2} maxLength={254} disabled={busy} required autoFocus />
        </label>
        <button type="submit" className="member-button" disabled={busy || identifier.trim().length < 2}>
          {busy ? "Searching…" : "Find member"}
        </button>
      </form>
      {error && <p className="member-error" role="alert">{error}</p>}
      {matches && (matches.items.length ? (
        <>
          <ul className="member-checkout-results">
            {matches.items.map((match) => (
              <li key={match.id}>
                <button className="member-button" type="button" onClick={() => onSelect(match)}>
                  <strong>{match.name}</strong>
                  <span>{match.email[0]}…@{match.email.split("@")[1]} · Phone ending {match.phone.slice(-4)}</span>
                </button>
              </li>
            ))}
          </ul>
          {matches.hasMore && <p className="member-muted">Refine your search to see more matches.</p>}
        </>
      ) : <p role="status">No matching members.</p>)}
    </>
  );
}
