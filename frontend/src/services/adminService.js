// src/services/adminService.js
import axios from "axios";
import { getToken } from "./authService";

const API_URL = "http://192.168.1.189:8000/api";

// --- Gestion des fichiers centralisés ---
export const getCentralizedFiles = async () => {
  const token = getToken();
  const res = await axios.get(`${API_URL}/centralized-files/`, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data.map((file) => ({
    ...file,
    fichier: `${API_URL.replace("/api", "")}/${file.fichier}`,
  }));
};

export const updateFile = async (fileId, data) => {
  const token = getToken();
  return axios.put(`${API_URL}/centralized-files/${fileId}/update/`, data, {
    headers: { Authorization: `Token ${token}` },
  });
};

export const deleteFile = async (fileId) => {
  const token = getToken();
  return axios.delete(`${API_URL}/centralized-files/${fileId}/delete/`, {
    headers: { Authorization: `Token ${token}` },
  });
};

// --- Utilisateurs ---
export const getUsers = async () => {
  const token = getToken();
  const res = await axios.get(`${API_URL}/utilisateurs/`, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data;
};

export const createUser = async (newUser) => {
  const token = getToken();
  return axios.post(`${API_URL}/utilisateurs/creer/`, newUser, {
    headers: { Authorization: `Token ${token}` },
  });
};

export const updateUserRole = async (userId, newRole) => {
  const token = getToken();
  return axios.put(
    `${API_URL}/utilisateurs/${userId}/role/`,
    { role: newRole },
    { headers: { Authorization: `Token ${token}` } }
  );
};

export const getAllSubmissions = async () => {
  const token = getToken();
  const res = await axios.get(`${API_URL}/soumissions/`, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data;
};

export const resetUserPassword = async (userId) => {
  const token = getToken();
  return axios.post(`${API_URL}/utilisateurs/${userId}/reset_password/`, {}, {
    headers: { Authorization: `Token ${token}` },
  });
};

export const deleteUserAccount = async (userId) => {
  const token = getToken();
  return axios.delete(`${API_URL}/utilisateurs/${userId}/delete/`, {
    headers: { Authorization: `Token ${token}` },
  });
};

export const updateUserAccount = async (userId, userData) => {
  const token = getToken();
  const res = await axios.put(`${API_URL}/utilisateurs/${userId}/update/`, userData, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data;
};

// --- Services ---
export const createService = async (serviceName) => {
  const token = getToken();
  return axios.post(
    `${API_URL}/services/create/`,
    { nom: serviceName },
    { headers: { Authorization: `Token ${token}` } }
  );
};

export const getServices = async () => {
  const token = getToken();
  const res = await axios.get(`${API_URL}/services/`, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data;
};

export const deleteService = async (serviceId) => {
  const token = getToken();
  return axios.delete(`${API_URL}/services/${serviceId}/delete/`, {
    headers: { Authorization: `Token ${token}` },
  });
};
