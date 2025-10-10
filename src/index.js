// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css"; // optional
import App from "./App";
import "./styles/layout.css";
import "./styles/theme.css";
import "./components/ToastProvider.css";
import "./components/ConfirmDialog";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
