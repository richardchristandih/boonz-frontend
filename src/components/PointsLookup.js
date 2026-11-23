import React, { useState } from "react";
import { FiX } from "react-icons/fi";
import MemberSearch from "./MemberSearch";

export default function PointsLookup({ onClose }) {
  const [member, setMember] = useState(null);

  return (
    <div className="paymodal" role="dialog" aria-modal="true" aria-labelledby="points-lookup-title"
      onClick={onClose} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="paymodal__dialog" onClick={(event) => event.stopPropagation()}>
        <header className="paymodal__head">
          <h3 id="points-lookup-title">Check points</h3>
          <button type="button" className="paymodal__close" aria-label="Close" onClick={onClose}><FiX /></button>
        </header>
        <div className="paymodal__body">
          {member ? (
            <div className="points-lookup-balance" role="status">
              <strong>{member.name}</strong>
              <span>{member.points.toLocaleString()} points</span>
            </div>
          ) : <MemberSearch onSelect={setMember} />}
        </div>
        <footer className="paymodal__actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          {member && <button type="button" className="btn btn-primary" autoFocus onClick={() => setMember(null)}>Check another member</button>}
        </footer>
      </div>
    </div>
  );
}
