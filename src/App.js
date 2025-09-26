// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import MainMenu from './pages/MainMenu';
import Login from './pages/Login';
import Register from './pages/Register';
import Orders from './pages/Orders';
import Dashboard from './pages/Dashboard';
import ProductPage from './pages/ProductPage';
import PrinterTest from './components/PrinterTest';
import Settings from './pages/Settings';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/product-page" element={<ProductPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/printer-test" element={<PrinterTest />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}

export default App;
