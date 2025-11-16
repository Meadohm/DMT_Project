// src/services/utils.js

export const formatDate = (dateString) => {
  if (!dateString) return "";
  try {
    // ISO direct
    let parsed = new Date(dateString);
    if (!isNaN(parsed)) return parsed.toLocaleString();

    // Format "YYYY-MM-DD HH:mm:ss"
    parsed = new Date(dateString.replace(" ", "T"));
    if (!isNaN(parsed)) return parsed.toLocaleString();

    return ""; // fallback
  } catch {
    return "";
  }
};
