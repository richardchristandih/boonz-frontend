// src/pages/Register.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Register.css";

/** Change this only if the owner email changes */
const OWNER_EMAIL = "richardchristandi@icloud.com";

/** Cooldown in seconds before user can request the PIN again */
const PIN_COOLDOWN_SEC = 60;

/** Expected PIN length */
const PIN_LENGTH = 6;

/** Tiny SVG spinner you can reuse in buttons */
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

export default function Register() {
  // form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  // admin pin
  const [adminPin, setAdminPin] = useState("");
  const [sendingPin, setSendingPin] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  // ui state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); // small success info

  // simple ticker for cooldown label
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - nowTs) / 1000));

  const navigate = useNavigate();

  // Clear pin if user switches out of admin role
  useEffect(() => {
    if (role !== "admin") setAdminPin("");
  }, [role]);

  // Request one-time PIN email for admin registration
  const sendAdminPin = async () => {
    if (sendingPin || cooldownLeft > 0) return;
    setError("");
    setNotice("");
    setSendingPin(true);
    try {
      await api.post("/auth/admin-pin/send", { to: OWNER_EMAIL });
      setCooldownUntil(Date.now() + PIN_COOLDOWN_SEC * 1000);
      setNotice(`PIN sent to ${OWNER_EMAIL}. Please check your inbox.`);
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
    setNotice("");

    // basic client validation
    if (!name.trim()) return setError("Please enter your name.");
    if (!email.trim()) return setError("Please enter your email.");
    if (!password.trim()) return setError("Please enter your password.");

    if (role === "admin") {
      const digitsOnly = adminPin.replace(/\D/g, "");
      if (digitsOnly.length !== PIN_LENGTH) {
        return setError(`Admin PIN must be ${PIN_LENGTH} digits.`);
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      };
      if (role === "admin") payload.adminPin = adminPin.replace(/\D/g, "");

      await api.post("/auth/register", payload);
      navigate("/login");
    } catch (err) {
      console.error(err?.response?.data || err.message);
      setError(
        err?.response?.data?.message ||
          "Registration failed. Please check your information and try again."
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
        {notice && (
          <p
            className="register-error"
            style={{
              color: "#116a36",
              background: "#e7f7ee",
              borderColor: "rgba(17,106,54,0.35)",
            }}
          >
            {notice}
          </p>
        )}

        <form onSubmit={handleSubmit} className="register-form">
          {/* Name */}
          <div className="field">
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
          </div>

          {/* Email */}
          <div className="field">
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
          </div>

          {/* Password */}
          <div className="field">
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
          </div>

          {/* Role */}
          <div className="field">
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
          </div>

          {/* Admin-only section */}
          {role === "admin" && (
            <div className="field" style={{ marginTop: 6 }}>
              {/* Label + Send PIN button on one row (matches .pin-row CSS) */}
              <div className="pin-row">
                <label htmlFor="adminPin" className="register-label">
                  Admin PIN:
                </label>

                <button
                  type="button"
                  onClick={sendAdminPin}
                  className="send-pin-btn"
                  disabled={sendingPin || cooldownLeft > 0 || submitting}
                  title={`Send PIN to ${OWNER_EMAIL}`}
                >
                  {sendingPin ? (
                    <>
                      <SpinnerSVG size={16} color="#F2994A" />
                      <span style={{ marginLeft: 8 }}>Sending…</span>
                    </>
                  ) : cooldownLeft > 0 ? (
                    <span>Resend in {cooldownLeft}s</span>
                  ) : (
                    <span>Send PIN</span>
                  )}
                </button>
              </div>

              {/* PIN input directly under the row (matches .pin-input CSS) */}
              <input
                id="adminPin"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d*"
                maxLength={PIN_LENGTH}
                className="register-input pin-input"
                placeholder={`Enter the ${PIN_LENGTH}-digit PIN`}
                value={adminPin}
                onChange={(e) => {
                  // keep only digits, cap length
                  const v = e.target.value
                    .replace(/\D/g, "")
                    .slice(0, PIN_LENGTH);
                  setAdminPin(v);
                }}
                disabled={submitting}
                required
              />
              <div className="help">
                A one-time PIN is emailed to <b>{OWNER_EMAIL}</b>. Enter it here
                to complete admin registration.
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className={`btn btn-primary register-button${
              submitting ? " is-loading" : ""
            }`}
            disabled={submitting}
          >
            {submitting && (
              <span style={{ marginRight: 8 }}>
                <SpinnerSVG />
              </span>
            )}
            {submitting ? "Registering..." : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
