import React, { useEffect, useState } from "react";
import { findMember, memberError, membershipProgram, searchMembers } from "../services/membership";
import { formatIDR } from "../utils/money";
import MemberForm from "./MemberForm";
import "../styles/membership.css";

export default function MemberCheckout({
  member, setMember, benefit, setBenefit, total, hasItems, onBusyChange, onContinue, onSkip,
}) {
  const [enrolling, setEnrolling] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [matches, setMatches] = useState(null);
  const [mode, setMode] = useState(benefit?.kind || (hasItems ? "earn" : "reward"));
  const [points, setPoints] = useState(benefit?.kind === "discount" ? String(benefit.points) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [programState, setProgramState] = useState({ program: null, error: "" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!member) return undefined;
    const controller = new AbortController();
    membershipProgram({ signal: controller.signal })
      .then((program) => setProgramState({ program, error: "" }))
      .catch(() => {
        if (!controller.signal.aborted) setProgramState({ program: null, error: "Couldn’t load the points and rewards." });
      });
    return () => controller.abort();
  }, [member, refresh]);

  function setWorking(active) {
    setBusy(active);
    onBusyChange(active);
  }

  function selectMember(next) {
    setMember(next);
    setBenefit(null);
    setMode(hasItems ? "earn" : "reward");
    setPoints("");
    setProgramState({ program: null, error: "" });
    setMatches(null);
    setEnrolling(false);
    setError("");
  }

  async function search(event) {
    event.preventDefault();
    setWorking(true);
    setMatches(null);
    setError("");
    try {
      setMatches(await searchMembers(identifier.trim()));
    } catch (failure) {
      setError(memberError(failure, "Couldn’t find members. Try again."));
    } finally {
      setWorking(false);
    }
  }

  async function refreshMember() {
    setWorking(true);
    setError("");
    try {
      selectMember(await findMember(member.email));
    } catch (failure) {
      setError(memberError(failure, "Couldn’t refresh the member. Try again."));
    } finally {
      setWorking(false);
    }
  }

  const { program, error: programError } = programState;
  const rewards = program?.rewards.filter((reward) => reward.active) || [];
  const pointsValue = program?.redemptionValue;
  const totalCents = Math.round(total * 100);
  const maxDiscount = pointsValue ? Math.max(0, Math.min(
    member?.points ?? 0, Math.floor(totalCents / (100 * pointsValue)), 100000000
  )) : 0;
  const discountPoints = Number(points);
  const discountValid = Number.isInteger(discountPoints) && discountPoints > 0 && discountPoints <= maxDiscount;
  const chosenReward = rewards.find((reward) =>
    reward.productId === benefit?.productId && reward.points === benefit?.points && reward.points <= member?.points
  );
  const due = mode === "discount" && discountValid ? (totalCents - discountPoints * pointsValue * 100) / 100 : total;
  const estimate = program ? Math.floor(Math.round(due * 100) / 100 / program.rupiahPerPoint) : null;
  const canContinue = member && (mode === "earn" || (mode === "reward" && chosenReward) || (mode === "discount" && discountValid));

  function continueCheckout() {
    if (!canContinue || busy) return;
    const nextBenefit = mode === "discount"
      ? { kind: "discount", points: discountPoints, value: pointsValue }
      : mode === "reward" ? { ...chosenReward, kind: "reward" } : null;
    setBenefit(nextBenefit);
    onContinue();
  }

  return (
    <>
      <div className="paymodal__body checkout-member-step">
        {member ? (
          <>
            <div className="member-selected">
              <div><h4>{member.name}</h4><span>{member.points.toLocaleString()} points available</span></div>
              <div className="member-actions">
                <button type="button" className="member-button" onClick={refreshMember} disabled={busy}>Refresh balance</button>
                <button type="button" className="member-button" onClick={() => selectMember(null)} disabled={busy}>Change member</button>
              </div>
            </div>
            <p className="member-muted">{member.email} · {member.phone}</p>
            <p className="member-muted">The receipt will be emailed to this member.</p>
            {programError ? (
              <p role="alert" className="member-error">{programError} <button className="member-button" type="button"
                disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Retry</button></p>
            ) : program ? (
              <>
                <fieldset className="member-benefits" disabled={busy}>
                  <legend>Use membership</legend>
                  {hasItems && <label><input type="radio" name="membership-use" value="earn" checked={mode === "earn"}
                    onChange={() => { setMode("earn"); setBenefit(null); }} /> Earn points only</label>}
                  {hasItems && <label><input type="radio" name="membership-use" value="discount" checked={mode === "discount"}
                    disabled={maxDiscount < 1} onChange={() => { setMode("discount"); setBenefit(null); }} />
                    Use points to reduce the total</label>}
                  <label><input type="radio" name="membership-use" value="reward" checked={mode === "reward"}
                    onChange={() => { setMode("reward"); setBenefit(null); }} /> Redeem an item</label>
                </fieldset>
                {mode === "discount" && (
                  <label className="member-field">Points to use
                    <input className="register-input" type="number" min="1" max={maxDiscount} step="1"
                      value={points} onChange={(event) => setPoints(event.target.value)} disabled={busy} />
                    <span className="member-muted">Up to {maxDiscount.toLocaleString()} points · {formatIDR(pointsValue)} per point</span>
                  </label>
                )}
                {mode === "reward" && (rewards.length > 0 ? (
                  <label className="member-field">Redeem a reward
                    <select className="register-input" value={benefit?.kind === "reward" ? benefit.productId : ""} disabled={busy}
                      onChange={(event) => {
                        const reward = rewards.find((item) => item.productId === event.target.value);
                        setBenefit(reward ? { ...reward, kind: "reward" } : null);
                      }}>
                      <option value="">Choose a reward</option>
                      {rewards.map((reward) => (
                        <option key={reward.productId} value={reward.productId} disabled={reward.points > member.points}>
                          {reward.name} · {reward.points.toLocaleString()} points{reward.points > member.points ? " (insufficient points)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : <p className="member-muted">No rewards are currently available.</p>)}
                {hasItems && <div className="payment-due"><span>Amount due</span><strong>{formatIDR(due)}</strong></div>}
                <p className="member-muted">{estimate.toLocaleString()} points expected on this transaction.</p>
              </>
            ) : <p className="member-muted" role="status">Loading membership options…</p>}
          </>
        ) : enrolling ? (
          <>
            <h4>Register a member</h4>
            <MemberForm onBusyChange={setWorking} onSaved={selectMember} onCancel={() => setEnrolling(false)} />
          </>
        ) : (
          <>
            <p>Ask the customer if they’re a Boonz member.</p>
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
            {matches && (matches.items.length ? (
              <>
                <ul className="member-checkout-results">
                  {matches.items.map((match) => (
                    <li key={match.id}>
                      <button className="member-button" type="button" onClick={() => selectMember(match)} disabled={busy}>
                        <strong>{match.name}</strong>
                        <span>{match.email[0]}…@{match.email.split("@")[1]} · Phone ending {match.phone.slice(-4)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {matches.hasMore && <p className="member-muted">Refine your search to see more matches.</p>}
              </>
            ) : <p role="status">No matching members.</p>)}
            <button type="button" className="member-button" onClick={() => setEnrolling(true)} disabled={busy}>Register new member</button>
          </>
        )}
        {error && <p className="member-error" role="alert">{error}</p>}
      </div>
      <footer className="paymodal__actions">
        <button type="button" className="btn btn-ghost" onClick={onSkip} disabled={busy}>{hasItems ? "Skip membership" : "Cancel"}</button>
        {member && <button type="button" className="btn btn-primary" onClick={continueCheckout} disabled={!canContinue || busy}>
          {hasItems ? "Continue to payment" : "Review redemption"}
        </button>}
      </footer>
    </>
  );
}
