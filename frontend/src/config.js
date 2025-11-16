// src/config.js
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
console.log("API_BASE_URL =", API_BASE_URL); // <-- vérification
export default API_BASE_URL;
