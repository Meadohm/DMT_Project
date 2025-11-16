// src/services/archiveService.js
import axios from "axios";
import API_BASE_URL from "../config";
import { getToken } from "./authService";

// --- 📦 Récupérer toutes les archives ---
export const getArchives = async () => {
  const token = getToken();
  try {
    const res = await axios.get(`${API_BASE_URL}/archives/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("❌ Erreur récupération des archives :", error);
    throw error;
  }
};


// ---Télécharger une archive ---
export const downloadArchive = async (id, filename = null, onProgress = null) => {
  const token = getToken();
  try {
    const res = await axios.get(`${API_BASE_URL}/archives/${id}/download/`, {
      headers: { Authorization: `Token ${token}` },
      responseType: "blob",
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.lengthComputable && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    // Extraire le vrai nom et type depuis les headers si disponible
    const contentDisposition = res.headers["content-disposition"];
    let suggestedName = filename || `archive_${id}`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?(.+)"?/);
      if (match && match[1]) {
        suggestedName = match[1];
      }
    }

    const mimeType = res.headers["content-type"] || "application/octet-stream";
    const blob = new Blob([res.data], { type: mimeType });

    // Extension auto-corrigée
    if (!suggestedName.endsWith(".zip") && !suggestedName.endsWith(".rar")) {
      if (mimeType === "application/zip") suggestedName += ".zip";
      else if (mimeType === "application/vnd.rar") suggestedName += ".rar";
    }

    // Téléchargement natif
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    console.log(`⬇️ Téléchargement terminé : ${suggestedName}`);
  } catch (error) {
    console.error("❌ Erreur lors du téléchargement de l'archive :", error);
    throw error;
  }
};



// --- Supprimer une archive ---
export const deleteArchive = async (id) => {
  const token = getToken();
  try {
    await axios.delete(`${API_BASE_URL}/archives/${id}/delete/`, {
      headers: { Authorization: `Token ${token}` },
    });
  } catch (error) {
    console.error("❌ Erreur suppression archive :", error);
    throw error;
  }
};

// --- Créer une nouvelle archive pour un dossier ---
export const createArchive = async (folderId, payload = {}) => {
  const token = getToken();
  try {
    const res = await axios.post(
      `${API_BASE_URL}/archives/${folderId}/create/`,
      payload,
      { headers: { Authorization: `Token ${token}` } }
    );
    return res.data;
  } catch (error) {
    console.error("❌ Erreur création archive :", error);
    throw error;
  }
};

// --- Partager une archive ---
export const shareArchive = async (archiveId, userList) => {
  const token = getToken();
  try {
    const res = await axios.post(
      `${API_BASE_URL}/archives/${archiveId}/share/`,
      userList,
      { headers: { Authorization: `Token ${token}` } }
    );
    return res.data;
  } catch (error) {
    console.error("❌ Erreur partage archive :", error);
    throw error;
  }
};

// --- ♻️ Désarchiver un dossier ---
export const unarchive = async (archiveId) => {
  const token = getToken();
  try {
    const res = await axios.post(
      `${API_BASE_URL}/archives/${archiveId}/unarchive/`,
      {},
      { headers: { Authorization: `Token ${token}` } }
    );
    return res.data;
  } catch (error) {
    console.error("❌ Erreur désarchivage :", error);
    throw error;
  }
};
