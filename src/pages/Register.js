// src/pages/Register.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Register.css";

const OWNER_EMAIL = "richardchristandi@icloud.com";
const PIN_COOLDOWN_SEC = 60;

function SpinnerSVG({ size = 16, color = "#fff" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      aria-hidden="true"
      focusable="false"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="31.4 188.4"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 25 25"
          to="360 25 25"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

function Register() {
  const [name, setName] = useState(""); // NEW: name field
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  const [adminPin, setAdminPin] = useState(""); // NEW: pin entry
  const [sendingPin, setSendingPin] = useState(false); // NEW: spinner for send PIN
  const [cooldownUntil, setCooldownUntil] = useState(0); // NEW: cooldown timestamp

  const [submitting, setSubmitting] = useState(false); // spinner for register
  const [error, setError] = useState("");

  const [nowTs, setNowTs] = useState(Date.now()); // ticker to refresh cooldown label
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - nowTs) / 1000));

  const navigate = useNavigate();

  // If user switches away from admin, clear pin
  useEffect(() => {
    if (role !== "admin") setAdminPin("");
  }, [role]);

  const sendAdminPin = async () => {
    if (sendingPin || cooldownLeft > 0) return;
    setError("");
    setSendingPin(true);
    try {
      // Trigger backend to email a one-time admin PIN to the owner
      await api.post("/auth/admin-pin/send", { to: OWNER_EMAIL });
      // Start cooldown
      setCooldownUntil(Date.now() + PIN_COOLDOWN_SEC * 1000);
    } catch (err) {
      console.error(err?.response?.data || err.message);
      setError("Failed to send admin PIN. Please try again.");
    } finally {
      setSendingPin(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");

    // Basic client validation
    if (!name.trim()) return setError("Please enter your name.");
    if (!email.trim()) return setError("Please enter your email.");
    if (!password.trim()) return setError("Please enter your password.");
    if (role === "admin" && !adminPin.trim()) {
      return setError("Admin PIN is required to register an admin account.");
    }

    setSubmitting(true);
    try {
      const payload = { name, email, password, role };
      if (role === "admin") payload.adminPin = adminPin.trim();

      await api.post("/auth/register", payload);
      navigate("/login");
    } catch (err) {
      console.error(err?.response?.data || err.message);
      setError(
        err?.response?.data?.message ||
          "Registration failed. Please check your info and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <h2 className="register-title">Register</h2>
        <p className="register-subtitle">
          Create your account. Admins require a one-time PIN.
        </p>

        {error && <p className="register-error">{error}</p>}

        <form onSubmit={handleSubmit} className="register-form">
          {/* Name */}
          <label htmlFor="name" className="register-label">
            Name:
          </label>
          <input
            id="name"
            type="text"
            className="register-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            required
          />

          {/* Email */}
          <label htmlFor="email" className="register-label">
            Email:
          </label>
          <input
            id="email"
            type="email"
            className="register-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
          />

          {/* Password */}
          <label htmlFor="password" className="register-label">
            Password:
          </label>
          <input
            id="password"
            type="password"
            className="register-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            required
          />

          {/* Role */}
          <label htmlFor="role" className="register-label">
            Role:
          </label>
          <select
            id="role"
            className="register-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={submitting}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          {/* Admin-only PIN section */}
          {role === "admin" && (
            <div className="admin-pin-block" style={{ marginTop: 6 }}>
              <div
                className="row"
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <label
                  htmlFor="adminPin"
                  className="register-label"
                  style={{ margin: 0 }}
                >
                  Admin PIN:
                </label>
                <button
                  type="button"
                  onClick={sendAdminPin}
                  className="register-button outline"
                  disabled={sendingPin || cooldownLeft > 0 || submitting}
                  title={`Send PIN to ${OWNER_EMAIL}`}
                  style={{
                    padding: "8px 10px",
                    height: 36,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {sendingPin ? (
                    <>
                      <SpinnerSVG size={16} color="#F2994A" />
                      <span>Sending…</span>
                    </>
                  ) : cooldownLeft > 0 ? (
                    <span>Resend in {cooldownLeft}s</span>
                  ) : (
                    <span>Send PIN</span>
                  )}
                </button>
              </div>

              <input
                id="adminPin"
                type="text"
                className="register-input"
                placeholder="Enter the 6-digit PIN"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                disabled={submitting}
                required
              />

              <p
                className="register-hint"
                style={{ fontSize: 12, color: "#666", marginTop: 4 }}
              >
                A one-time PIN will be emailed to <b>{OWNER_EMAIL}</b>. Enter it
                here to complete admin registration.
              </p>
            </div>
          )}

          <button
            type="submit"
            className={`register-button ${submitting ? "is-loading" : ""}`}
            disabled={submitting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitting && <SpinnerSVG />}
            {submitting ? "Registering…" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Register;
