import React, { useState } from "react";
import "./PromptDialog.css";

export default function PromptDialog({
  open,
  title,
  message,
  defaultValue = "",
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);

  if (!open) return null;

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div className="prompt-dialog" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {message && <p>{message}</p>}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="prompt-input"
          autoFocus
        />
        <div className="prompt-actions">
          <button onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={() => onConfirm(value)} className="btn btn-primary">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
