//src/services/folderService.js
import axios from "axios";
import { getToken } from "./authService";
import API_BASE_URL from "../config"; // centralisation URL API

//Lister les dossiers
export const listFolders = async () => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_BASE_URL}/folders/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("❌ Erreur récupération dossiers :", error.response || error.message);
    throw error;
  }
};

//Lister les dossiers du service (responsable)
export const listFoldersService = async () => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_BASE_URL}/folders/service/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("❌ Erreur récupération dossiers service :", error.response || error.message);
    throw error;
  }
};

//Créer un dossier
export const createFolder = async (name) => {
  try {
    const token = getToken();
    const res = await axios.post(
      `${API_BASE_URL}/folders/create/`,
      { nom: name },
      {
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data;
  } catch (error) {
    console.error("❌ Erreur création dossier :", error.response || error.message);
    throw error;
  }
};

//Renommer un dossier
export const renameFolder = async (id, newName) => {
  try {
    const token = getToken();
    const res = await axios.put(
      `${API_BASE_URL}/folders/${id}/rename/`,
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
    console.error("❌ Erreur renommage dossier :", error.response || error.message);
    throw error;
  }
};

//Supprimer un dossier
export const deleteFolder = async (id) => {
  try {
    const token = getToken();
    await axios.delete(`${API_BASE_URL}/folders/${id}/delete/`, {
      headers: { Authorization: `Token ${token}` },
    });
  } catch (error) {
    console.error("❌ Erreur suppression dossier :", error.response || error.message);
    throw error;
  }
};

//Partager un dossier avec d'autres utilisateurs/services
export const shareFolder = async (folderId, shares) => {
  const res = await fetch(`${API_BASE_URL}/folders/${folderId}/share/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify(shares), // tableau complet
  });

  if (!res.ok) {
    throw new Error("Erreur partage dossier");
  }
  return await res.json();
};

//PATCH mise à jour d’une permission de partage
export async function updateSharePermission(shareId, updates) {
  const res = await fetch(`${API_BASE_URL}/shares/${shareId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Erreur lors de la mise à jour de la permission");
  return await res.json();
}

//POST quitter un dossier partagé
export const leaveFolder = async (folderId) => {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/folders/${folderId}/leave/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error("Erreur quitter dossier");
    return await res.json();
  } catch (error) {
    console.error("❌ Erreur leave_folder :", error);
    throw error;
  }
};