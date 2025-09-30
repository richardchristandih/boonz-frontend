import React from "react";
import "./Skeleton.css";

export default function ErrorState({
  message = "Something went wrong.",
  onRetry,
}) {
  return (
    <div className="page-container">
      <div className="error-card">
        <div className="error-icon">⚠️</div>
        <h2>Couldn’t load dashboard</h2>
        <p>{message}</p>
        {onRetry && (
          <button className="retry-btn" onClick={onRetry} type="button">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
