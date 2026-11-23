import React, { useEffect, useState } from "react";
import { FiUserPlus } from "react-icons/fi";
import { findMember, memberError, membershipProgram } from "../services/membership";
import { formatIDR } from "../utils/money";
import MemberForm from "./MemberForm";
import "../styles/membership.css";

export default function MemberCheckout({
  member, setMember, reward, setReward, total, disabled, onBusyChange, rewardOnly,
}) {
  const [open, setOpen] = useState(rewardOnly || !!member);
  const [enrolling, setEnrolling] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [programState, setProgramState] = useState({ program: null, error: "" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!member) return undefined;
    const controller = new AbortController();
    membershipProgram({ signal: controller.signal })
      .then((program) => setProgramState({ program, error: "" }))
      .catch(() => {
        if (!controller.signal.aborted) setProgramState({ program: null, error: "Couldn’t load the rewards." });
      });
    return () => controller.abort();
  }, [member, refresh]);

  const chooseMember = (next) => {
    setMember(next);
    setReward(null);
    setProgramState({ program: null, error: "" });
    setIdentifier("");
    setEnrolling(false);
    setError("");
  };

  async function lookup(value) {
    setSearching(true);
    onBusyChange(true);
    setError("");
    try {
      chooseMember(await findMember(value));
    } catch (failure) {
      setError(memberError(failure, "Couldn’t look up the member. Try again."));
    } finally {
      setSearching(false);
      onBusyChange(false);
    }
  }

  const { program, error: programError } = programState;
  const rewards = program?.rewards.filter((option) => option.active) || [];
  const estimate = program ? Math.floor(Math.round(total * 100) / 100 / program.rupiahPerPoint) : null;

  return (
    <section className="checkout-member" aria-label="Boonz membership">
      {!open ? (
        <button className="member-button" type="button" onClick={() => setOpen(true)} disabled={disabled}>
          <FiUserPlus aria-hidden="true" /> Add a member
        </button>
      ) : member ? (
        <>
          <div className="member-selected">
            <div><h4>{member.name}</h4><span>{member.points.toLocaleString()} points available</span></div>
            <div className="member-actions">
              <button type="button" className="member-button" onClick={() => lookup(member.email)} disabled={disabled || searching}>
                {searching ? "Refreshing…" : "Refresh balance"}
              </button>
              <button type="button" className="member-button" onClick={() => chooseMember(null)} disabled={disabled || searching}>Remove member</button>
            </div>
          </div>
          <p className="member-muted">Receipt will be sent to {member.email}.</p>
          {error && <p className="member-error" role="alert">{error}</p>}
          {programError ? (
            <p role="alert" className="member-error">{programError} <button className="member-button" type="button"
              disabled={disabled} onClick={() => setRefresh((value) => value + 1)}>Retry</button></p>
          ) : program ? (
            <>
              {rewards.length > 0 ? (
                <label className="member-field">Redeem a reward
                  <select className="register-input" value={reward?.productId || ""} disabled={disabled}
                    onChange={(event) => setReward(rewards.find((option) => option.productId === event.target.value) || null)}>
                    <option value="">No reward</option>
                    {rewards.map((option) => (
                      <option key={option.productId} value={option.productId} disabled={option.points > member.points}>
                        {option.name} · {option.points.toLocaleString()} points{option.points > member.points ? " (insufficient points)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : <p className="member-muted">No rewards are currently available.</p>}
              {reward && <p className="member-muted">{reward.name} is added at no charge.</p>}
              <p className="member-muted">
                {estimate.toLocaleString()} points expected · 1 point per {formatIDR(program.rupiahPerPoint)} paid
              </p>
            </>
          ) : <p className="member-muted" role="status">Loading rewards…</p>}
        </>
      ) : enrolling ? (
        <>
          <h4>Register a member</h4>
          <MemberForm disabled={disabled} onBusyChange={onBusyChange}
            onSaved={chooseMember} onCancel={() => setEnrolling(false)} />
        </>
      ) : (
        <>
          <h4>Find a member</h4>
          <form className="member-lookup" onSubmit={(event) => { event.preventDefault(); lookup(identifier); }}>
            <label className="member-field">Email or phone number
              <input className="register-input" value={identifier} onChange={(event) => setIdentifier(event.target.value)}
                required maxLength={254} disabled={disabled || searching} />
            </label>
            <button type="submit" className="member-button" disabled={disabled || searching}>
              {searching ? "Looking up…" : "Find member"}
            </button>
          </form>
          {error && <p className="member-error" role="alert">{error}</p>}
          <button type="button" className="member-button" onClick={() => setEnrolling(true)} disabled={disabled || searching}>New member</button>
        </>
      )}
    </section>
  );
}
