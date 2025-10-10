import React, { createContext, useContext, useState, useCallback } from "react";
import "./ConfirmDialog.css";

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: "",
    message: "",
    resolve: null,
    confirmText: "Confirm",
    cancelText: "Cancel",
  });

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: opts?.title || "Are you sure?",
        message: opts?.message || "",
        confirmText: opts?.confirmText || "Confirm",
        cancelText: opts?.cancelText || "Cancel",
        resolve,
      });
    });
  }, []);

  function close(answer) {
    state.resolve?.(answer);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }

  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={() => close(false)}
        >
          <div className="modal__dialog" onClick={(e) => e.stopPropagation()}>
            <header className="modal__head">
              <strong>{state.title}</strong>
              <button
                className="modal__close"
                onClick={() => close(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <div className="modal__body">{state.message}</div>
            <footer className="modal__actions">
              <button className="btn" onClick={() => close(true)}>
                {state.confirmText}
              </button>
              <button className="btn outline" onClick={() => close(false)}>
                {state.cancelText}
              </button>
            </footer>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx.confirm;
}
