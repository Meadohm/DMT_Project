// src/services/fileService.js
import axios from "axios";
import { getToken } from "./authService";
import API_BASE_URL from "../config"; //Import centralisé

// 📂 Récupérer fichiers d’un dossier
export const getFilesByFolder = async (folderId) => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_BASE_URL}/folders/${folderId}/files/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("❌ Erreur récupération fichiers :", error.response || error.message);
    throw error;
  }
};

// Uploader un fichier
export const uploadFile = async (folderId, file) => {
  try {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await axios.post(`${API_BASE_URL}/folders/${folderId}/upload/`, formData, {
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  } catch (error) {
    console.error("❌ Erreur upload fichier :", error.response || error.message);
    throw error;
  }
};

//Renommer un fichier
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
    console.error("❌ Erreur renommage fichier :", error.response || error.message);
    throw error;
  }
};

// Supprimer un fichier
export const deleteFile = async (fileId) => {
  try {
    const token = getToken();
    await axios.delete(`${API_BASE_URL}/files/${fileId}/delete/`, {
      headers: { Authorization: `Token ${token}` },
    });
  } catch (error) {
    console.error("❌ Erreur suppression fichier :", error.response || error.message);
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
    console.error("❌ Erreur récupération utilisateur :", error.response || error.message);
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
    console.error("❌ Erreur récupération historique :", error.response || error.message);
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
    console.error("❌ Erreur suppression historique :", error.response || error.message);
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
    console.error("❌ Erreur preview fichier :", error.response || error.message);
    throw error;
  }
};
