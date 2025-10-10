import React, { createContext, useContext, useCallback, useState } from "react";
import "./ToastProvider.css";
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36);
    const toast = { id, msg, type: opts.type || "info", ttl: opts.ttl ?? 3200 };
    setToasts((t) => [...t, toast]);
    if (toast.ttl > 0) {
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, toast.ttl);
    }
    return id;
  }, []);

  const hide = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ show, hide }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.type}`}
            role="status"
            onClick={() => hide(t.id)}
            title="Click to dismiss"
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
