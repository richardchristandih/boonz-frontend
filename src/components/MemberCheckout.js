import React, { useEffect, useState } from "react";
import { findMember, memberError, membershipProgram } from "../services/membership";
import { formatIDR } from "../utils/money";
import MemberForm from "./MemberForm";
import MemberSearch from "./MemberSearch";
import "../styles/membership.css";

export default function MemberCheckout({
  member, setMember, benefit, setBenefit, total, hasItems, onBusyChange, onContinue, onSkip,
}) {
  const [enrolling, setEnrolling] = useState(false);
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
    setEnrolling(false);
    setError("");
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
  const rewards = program?.rewards.filter((reward) => reward.active)
    .sort((a, b) => a.points - b.points || a.name.localeCompare(b.name)) || [];
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
                <section className="checkout-rewards" aria-labelledby="checkout-rewards-title">
                  <h4 id="checkout-rewards-title">Redeem a reward</h4>
                  {rewards.length ? (
                    <ul className="checkout-reward-list">
                      {rewards.map((reward) => {
                        const shortfall = Math.max(0, reward.points - member.points);
                        const selected = mode === "reward" && chosenReward?.productId === reward.productId;
                        return (
                          <li key={reward.productId}>
                            <button className="member-button" type="button" disabled={busy || shortfall > 0}
                              aria-pressed={selected} onClick={() => {
                                setMode("reward");
                                setBenefit({ ...reward, kind: "reward" });
                              }}>
                              <strong>{reward.name}</strong>
                              <span>{reward.points.toLocaleString()} points</span>
                              <span>{shortfall > 0 ? `Need ${shortfall.toLocaleString()} more` : selected ? "Selected" : "Available to redeem"}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="member-muted">No rewards are currently available.</p>}
                </section>
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
            <MemberSearch onSelect={selectMember} onBusyChange={setWorking} />
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
