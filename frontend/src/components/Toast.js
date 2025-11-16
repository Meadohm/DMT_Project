// src/components/Toast.js
import React, { useEffect } from "react";
import "../styles/Toast.css";

export default function Toast({ type = "success", message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icon =
    type === "success" ? "✅" :
    type === "error" ? "❌" :
    type === "info" ? "ℹ️" : "🔔";

  return (
    <div className={`toast ${type}`}>
      <span className="toast-icon">{icon}</span>
      <p className="toast-message">{message}</p>
    </div>
  );
}
