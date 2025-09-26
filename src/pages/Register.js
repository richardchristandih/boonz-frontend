// src/pages/Register.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Register.css'; // Import the CSS file

function Register() {
  const [name, setName] = useState('');     // <--- NEW: name field
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Include 'name' in the request body
      await api.post('/auth/register', { name, email, password, role });
      navigate('/login');
    } catch (err) {
      setError('Registration failed');
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <h2 className="register-title">Register</h2>
        {error && <p className="register-error">{error}</p>}
        <form onSubmit={handleSubmit} className="register-form">
          {/* Name Field */}
          <label htmlFor="name" className="register-label">Name:</label>
          <input
            id="name"
            type="text"
            className="register-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label htmlFor="email" className="register-label">Email:</label>
          <input
            id="email"
            type="email"
            className="register-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password" className="register-label">Password:</label>
          <input
            id="password"
            type="password"
            className="register-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label htmlFor="role" className="register-label">Role:</label>
          <select
            id="role"
            className="register-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          <button type="submit" className="register-button">Register</button>
        </form>
      </div>
    </div>
  );
}

export default Register;
