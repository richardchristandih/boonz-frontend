// src/components/Navbar.js
import React from 'react';
import { Link } from 'react-router-dom';

function Navbar() {
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <nav style={{ padding: '10px', background: '#f5f5f5' }}>
      {/* Maybe rename "Dashboard" to "Home" if you prefer */}
      <Link to="/" style={{ marginRight: '10px' }}>Home</Link>
      <Link to="/orders" style={{ marginRight: '10px' }}>Orders</Link>
      <Link to="/login" style={{ marginRight: '10px' }}>Login</Link>
      <Link to="/register" style={{ marginRight: '10px' }}>Register</Link>
      <button onClick={handleLogout}>Logout</button>
    </nav>
  );
}

export default Navbar;
