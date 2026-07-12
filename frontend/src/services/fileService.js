// src/services/fileService.js
import axios from "axios";
import { getToken } from "./authService";
import API_BASE_URL from "../config"; //Import centralisé

// Récupérer fichiers d’un dossier
export const getFilesByFolder = async (folderId) => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_BASE_URL}/folders/${folderId}/files/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("Erreur récupération fichiers :", error.response || error.message);
    throw error;
  }
};

// Uploader un fichier
export const uploadFile = (folderId, file) => {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/folders/${folderId}/upload/`);
    xhr.setRequestHeader('Authorization', `Token ${token}`);
    xhr.timeout = 300000; // 5 minutes

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          reject(new Error(JSON.parse(xhr.responseText).error || 'Erreur upload'));
        } catch {
          reject(new Error('Erreur upload'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network Error'));
    xhr.ontimeout = () => reject(new Error('Upload timeout'));
    xhr.send(formData);
  });
};

// Renommer un fichier
export const renameFile = async (fileId, newName) => {
  try {
    const token = getToken();
    const res = await axios.put(
      `${API_BASE_URL}/files/${fileId}/rename/`,
      { nom: newName },
      {
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data;
  } catch (error) {
    console.error("Erreur renommage fichier :", error.response || error.message);
    throw error;
  }
};

// Déplacer un fichier vers un autre dossier
export const moveFile = async (fileId, folderId) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/files/${fileId}/move/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ folder_id: folderId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erreur déplacement fichier");
  }
  return res.json();
};

// Supprimer un fichier
export const deleteFile = async (fileId) => {
  try {
    const token = getToken();
    await axios.delete(`${API_BASE_URL}/files/${fileId}/delete/`, {
      headers: { Authorization: `Token ${token}` },
    });
  } catch (error) {
    console.error("Erreur suppression fichier :", error.response || error.message);
    throw error;
  }
};

// Infos utilisateur
export const getUserInfo = async () => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_BASE_URL}/user/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("Erreur récupération utilisateur :", error.response || error.message);
    throw error;
  }
};

// Historique
export const getHistorique = async () => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_BASE_URL}/historique/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("Erreur récupération historique :", error.response || error.message);
    throw error;
  }
};

export const deleteHistorique = async (id) => {
  try {
    const token = getToken();
    await axios.delete(`${API_BASE_URL}/historique/${id}/`, {
      headers: { Authorization: `Token ${token}` },
    });
  } catch (error) {
    console.error("Erreur suppression historique :", error.response || error.message);
    throw error;
  }
};

// Prévisualisation fichier
export const previewFile = async (fileId) => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_BASE_URL}/files/${fileId}/preview/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("Erreur preview fichier :", error.response || error.message);
    throw error;
  }
};
