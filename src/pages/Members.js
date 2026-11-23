import React, { useEffect, useState } from "react";
import { FiGift, FiUserPlus } from "react-icons/fi";
import WorkspacePage from "../components/WorkspacePage";
import MemberForm from "../components/MemberForm";
import MemberPointsEditor from "../components/MemberPointsEditor";
import api from "../services/api";
import { memberError, membershipAccess, membershipProgram } from "../services/membership";
import { formatIDR } from "../utils/money";
import "../styles/membership.css";

const activityLabels = {
  earned: "Earned",
  redeemed: "Redeemed",
  earn_reversed: "Earned points reversed",
  redemption_returned: "Redeemed points returned",
  adjustment: "Manual adjustment",
};

function MemberProgram() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [rate, setRate] = useState("");
  const [redemptionValue, setRedemptionValue] = useState("");
  const [productId, setProductId] = useState("");
  const [points, setPoints] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([membershipProgram(options), api.get("/products", options)])
      .then(([program, { data: products }]) => {
        setData({ ...program, products: [...products].sort((a, b) => a.name.localeCompare(b.name)) });
        setRate(String(program.rupiahPerPoint));
        setRedemptionValue(String(program.redemptionValue));
        setError("");
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(memberError(failure, "Couldn’t load the membership program."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  function selectReward(id) {
    const reward = data.rewards.find((item) => item.productId === id);
    setProductId(id);
    setPoints(reward ? String(reward.points) : "");
    setActive(reward?.active ?? true);
  }

  async function save(event, rule) {
    event.preventDefault();
    setStatus("");
    setError("");
    setBusy(true);
    try {
      if (rule) {
        const { data: ruleData } = await api.put("/members/program", {
          rupiahPerPoint: Number(rate), redemptionValue: Number(redemptionValue),
        });
        setData((current) => ({ ...current, ...ruleData }));
        setStatus("Point settings saved.");
      } else {
        const { data: reward } = await api.put(`/members/rewards/${productId}`, { points: Number(points), active });
        const name = data.products.find((item) => item._id === productId)?.name;
        setData((current) => ({ ...current, rewards: [
          ...current.rewards.filter((item) => item.productId !== productId),
          { ...reward, name },
        ].sort((a, b) => a.name.localeCompare(b.name)) }));
        setStatus("Reward saved.");
      }
    } catch (failure) {
      setError(memberError(failure, "Couldn’t save the program settings."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-section members-program">
      <h2><FiGift aria-hidden="true" /> Points and rewards</h2>
      {loading ? <p role="status">Loading program…</p> : data ? (
        <>
          <form className="member-lookup" onSubmit={(event) => save(event, true)}>
            <label className="member-field">Rupiah paid per point
              <input className="register-input" type="number" min="1" max="1000000000" step="1"
                value={rate} onChange={(event) => setRate(event.target.value)} required disabled={busy} />
            </label>
            <label className="member-field">Discount value per point (rupiah)
              <input className="register-input" type="number" min="1" max="1000000000" step="1"
                value={redemptionValue} onChange={(event) => setRedemptionValue(event.target.value)} required disabled={busy} />
            </label>
            <button type="submit" className="member-button primary" disabled={busy}>Save point settings</button>
          </form>
          <p className="member-muted">Members earn 1 point per full {formatIDR(data.rupiahPerPoint)} paid after discounts.</p>

          <form className="member-reward-form" onSubmit={(event) => save(event, false)}>
            <fieldset disabled={busy}>
              <div className="member-fields">
                <label>Reward item
                  <select className="register-input" value={productId} required onChange={(event) => selectReward(event.target.value)}>
                    <option value="">Choose a product</option>
                    {data.products.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </label>
                <label>Points needed
                  <input className="register-input" type="number" min="1" max="1000000" step="1"
                    value={points} onChange={(event) => setPoints(event.target.value)} required />
                </label>
                <label className="member-checkbox"><input type="checkbox" checked={active}
                  onChange={(event) => setActive(event.target.checked)} /> Available at checkout</label>
              </div>
              <button type="submit" className="member-button primary">Save reward</button>
            </fieldset>
          </form>
          {data.rewards.length > 0 && (
            <ul className="member-rewards">
              {data.rewards.map((reward) => (
                <li key={reward.productId}>
                  <div><strong>{reward.name}</strong><span>{reward.points.toLocaleString()} points · {reward.active ? "Active" : "Inactive"}</span></div>
                  <button type="button" className="member-button" onClick={() => selectReward(reward.productId)} disabled={busy}>Edit<span className="sr-only"> {reward.name}</span></button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : <button className="member-button" type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Retry program</button>}
      {status && <p role="status">{status}</p>}
      {error && <p className="member-error" role="alert">{error}</p>}
    </section>
  );
}

function CashierAccess() {
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.get("/members/staff", { signal: controller.signal })
      .then(({ data }) => setStaff(data))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(memberError(failure, "Couldn’t load cashier accounts."));
      });
    return () => controller.abort();
  }, [refresh]);

  async function changeAccess(cashier) {
    setError("");
    setBusy(cashier.id);
    try {
      const { data } = await api.put(`/members/staff/${cashier.id}`, { allowed: !cashier.allowed });
      setStaff((current) => current.map((item) =>
        item.id === data.userId ? { ...item, allowed: data.allowed } : item));
    } catch (failure) {
      setError(memberError(failure, "Couldn’t change cashier access."));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="workspace-section">
      <h2>Cashier access</h2>
      <p className="member-muted">Give trusted cashier accounts access to enroll members, look up details, and redeem rewards.</p>
      {error && <p className="member-error" role="alert">{error}</p>}
      {staff ? (
        staff.length ? <ul className="member-rewards">
          {staff.map((cashier) => (
            <li key={cashier.id}>
              <div><strong>{cashier.name}</strong><span>{cashier.email}</span></div>
              <button className="member-button" type="button" disabled={Boolean(busy)}
                onClick={() => changeAccess(cashier)}>
                {busy === cashier.id ? "Saving…" : cashier.allowed ? "Revoke access" : "Grant access"}
                <span className="sr-only"> for {cashier.name}</span>
              </button>
            </li>
          ))}
        </ul> : <p className="member-muted">No cashier accounts to approve.</p>
      ) : error ? (
        <button type="button" className="member-button" onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Retry</button>
      ) : <p role="status">Loading cashier accounts…</p>}
    </section>
  );
}

function MemberActivity({ member }) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get(`/members/${member.id}/activity`, { signal: controller.signal })
      .then(({ data }) => setResult({ entries: data }))
      .catch(() => { if (!controller.signal.aborted) setResult({ error: true }); });
    return () => controller.abort();
  }, [member.id, revision]);

  return (
    <section className="workspace-section" aria-label={`${member.name} points history`}>
      <h2>{member.name} · {member.points.toLocaleString()} points</h2>
      {!result ? <p role="status">Loading points history…</p> : result.error ? (
        <p role="alert">Couldn’t load points history. <button className="member-button" type="button"
          onClick={() => { setResult(null); setRevision((value) => value + 1); }}>Retry</button></p>
      ) : result.entries.length ? (
        <ul className="member-rewards">
          {result.entries.map((entry) => (
            <li key={entry.id}><div><strong>{activityLabels[entry.kind]}</strong>
              <span>{entry.orderNumber ? `Order #${entry.orderNumber} · ` : entry.adjustedBy ? `${entry.adjustedBy} · ` : ""}
                {new Date(entry.createdAt).toLocaleString()}</span>
              {entry.reason && <span>{entry.reason}</span>}</div>
              <strong>{entry.points > 0 ? "+" : ""}{entry.points.toLocaleString()}</strong></li>
          ))}
        </ul>
      ) : <p className="member-muted">No points activity yet.</p>}
    </section>
  );
}

export default function Members() {
  const [admin] = useState(() => {
    try { return ["admin", "superadmin"].includes(JSON.parse(localStorage.getItem("user"))?.role); }
    catch { return false; }
  });
  const [tab, setTab] = useState("directory");
  const [access, setAccess] = useState(null);
  const [accessRevision, setAccessRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [results, setResults] = useState(null);
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pointsEditor, setPointsEditor] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    membershipAccess({ signal: controller.signal })
      .then((allowed) => setAccess({ allowed }))
      .catch(() => { if (!controller.signal.aborted) setAccess({ error: true }); });
    return () => controller.abort();
  }, [accessRevision]);

  useEffect(() => {
    if (!access?.allowed) return undefined;
    const controller = new AbortController();
    api.get("/members", { params: { q, page }, signal: controller.signal })
      .then(({ data }) => setResults(data))
      .catch(() => { if (!controller.signal.aborted) setResults({ error: true }); });
    return () => controller.abort();
  }, [access, q, page, revision]);

  function loadPage(nextPage, term = q) {
    setResults(null);
    setPage(nextPage);
    setQ(term);
    setRevision((value) => value + 1);
  }

  function onSaved(member) {
    setForm(null);
    setSelected(member);
    loadPage(1, "");
    setSearch("");
  }

  function onPointsSaved(member) {
    setPointsEditor(null);
    setSelected(member);
    setResults((current) => current?.items
      ? { ...current, items: current.items.map((item) => item.id === member.id ? member : item) }
      : current);
  }

  return (
    <WorkspacePage title="Membership" description="Register members and look up their points."
      actions={access?.allowed && tab === "directory" && (
        <button type="button" className="workspace-button primary" onClick={() => setForm({})}>
          <FiUserPlus aria-hidden="true" /> New member
        </button>
      )}>
      {access?.allowed && admin && <div className="workspace-switcher" aria-label="Membership views">
        <button type="button" aria-pressed={tab === "directory"} onClick={() => setTab("directory")}>Members</button>
        <button type="button" aria-pressed={tab === "program"} onClick={() => setTab("program")}>Points and rewards</button>
        <button type="button" aria-pressed={tab === "staff"} onClick={() => setTab("staff")}>Cashier access</button>
      </div>}
      {!access ? <p role="status">Checking membership access…</p> : access.error ? (
        <section className="workspace-section"><p role="alert">Couldn’t check membership access.</p>
          <button type="button" className="member-button" onClick={() => { setAccess(null); setAccessRevision((value) => value + 1); }}>Retry</button>
        </section>
      ) : !access.allowed ? (
        <section className="workspace-section">
          <p>Ask a Boonz admin to approve your account under Membership → Cashier access.</p>
          <button type="button" className="member-button" onClick={() => { setAccess(null); setAccessRevision((value) => value + 1); }}>Check access again</button>
        </section>
      ) : tab === "program" ? <MemberProgram /> : tab === "staff" ? <CashierAccess /> : (
        <>
          {form && <section className="workspace-section">
            <h2>{form.id ? "Edit member" : "New member"}</h2>
            <MemberForm key={form.id || "new"} member={form.id ? form : undefined}
              onSaved={onSaved} onCancel={() => setForm(null)} />
          </section>}
          <section className="workspace-section">
            <h2>Member list</h2>
            <form className="member-lookup" onSubmit={(event) => { event.preventDefault(); loadPage(1, search.trim()); }}>
              <label className="member-field">Search by name, email, or phone
                <input className="register-input" value={search} maxLength={254} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <button className="member-button" type="submit">Search</button>
              {q && <button className="member-button" type="button" onClick={() => { setSearch(""); loadPage(1, ""); }}>Clear</button>}
            </form>
            {!results ? <p role="status">Loading members…</p> : results.error ? (
              <p className="member-error" role="alert">Couldn’t load members. <button type="button" className="member-button" onClick={() => loadPage(page)}>Retry</button></p>
            ) : results.items.length ? (
              <ul className="member-directory">
                {results.items.map((member) => (
                  <li key={member.id}>
                    <div><strong>{member.name}</strong><span>{member.email}</span><span>{member.phone}</span></div>
                    <strong className="member-points">{member.points.toLocaleString()} pts</strong>
                    <div className="member-actions">
                      <button type="button" className="member-button" aria-pressed={selected?.id === member.id}
                        onClick={() => setSelected(member)}>History<span className="sr-only"> for {member.name}</span></button>
                      {admin && <>
                        <button type="button" className="member-button" onClick={() => setForm(member)}>
                          Edit<span className="sr-only"> {member.name}</span></button>
                        <button type="button" className="member-button" onClick={() => setPointsEditor(member)}>
                          Adjust points<span className="sr-only"> for {member.name}</span></button>
                      </>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="member-muted">{q ? "No members match your search." : "No members registered yet."}</p>}
            {(page > 1 || results?.hasMore) && <div className="member-actions">
              <button type="button" className="member-button" disabled={page === 1} onClick={() => loadPage(page - 1)}>Previous</button>
              <span>Page {page}</span>
              <button type="button" className="member-button" disabled={!results?.hasMore} onClick={() => loadPage(page + 1)}>Next</button>
            </div>}
          </section>
          {selected && <MemberActivity key={`${selected.id}:${selected.points}`} member={selected} />}
          {pointsEditor && <MemberPointsEditor member={pointsEditor} onSaved={onPointsSaved}
            onClose={() => setPointsEditor(null)} />}
        </>
      )}
    </WorkspacePage>
  );
}
