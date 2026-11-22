// src/pages/Login.jsx
import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import "./Login.css";
import logo from "../images/login-logo.png";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return; // prevent double submit
    setError("");
    setIsLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });

      const access = data.accessToken || data.token;
      const refresh = data.refreshToken || null;
      if (!access) throw new Error("No access token returned from server");

      localStorage.setItem("token", access);
      if (refresh) localStorage.setItem("refreshToken", refresh);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));

      navigate(from, { replace: true });
    } catch (err) {
      console.error(err?.response?.data || err.message);
      const rejected = [400, 401, 403].includes(err.response?.status);
      setError(rejected ? "Email or password is incorrect." : "Couldn’t connect to Boonz. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container boonz-auth">
      <div className="login-card">
        {/* replaced the text heading with your logo */}
        <img src={logo} alt="Boonz" className="login-logo" />

        <h1 className="login-title">Sign in</h1>

        {error && <p className="login-error" role="alert">{error}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="email" className="login-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="login-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="username"
          />

          <label htmlFor="password" className="login-label">
            Password
          </label>
          <div className="boonz-password-row">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="current-password"
          />
          <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"} password</button>
          </div>

          <button
            type="submit"
            className={`login-button ${isLoading ? "is-loading" : ""}`}
            disabled={isLoading}
            aria-busy={isLoading}
            aria-live="polite"
          >
            {isLoading ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Logging in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="login-footer">
          Need an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
