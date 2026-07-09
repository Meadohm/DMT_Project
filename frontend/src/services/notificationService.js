//src/services/notificationService.js

import API_BASE_URL from "../config";
import axios from "axios";
//const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

export async function listNotifications() {
  const token = localStorage.getItem("token");
  const res = await axios.get(`${API_BASE_URL}/notifications/`, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data.results ?? res.data;
}

export async function markAllRead() {
  const token = localStorage.getItem("token");
  const res = await axios.post(`${API_BASE_URL}/notifications/mark_read/`, {}, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data;
}

export async function clearAll() {
  const token = localStorage.getItem("token");
  const res = await axios.delete(`${API_BASE_URL}/notifications/clear/`, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data;
}

export async function deleteNotification(id) {
  const token = localStorage.getItem("token");
  const res = await axios.delete(`${API_BASE_URL}/notifications/${id}/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });
  return res.data;
}



export async function createNotification(data) {
  try {
    const token = localStorage.getItem("token");
    const res = await axios.post(`${API_BASE_URL}/notifications/create/`, data, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Erreur création notification", err);
    throw err;
  }
}
