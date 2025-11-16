// src/components/AdminFileManager.js
import React, { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { getCentralizedFiles, updateFile, deleteFile } from "../services/adminService";
import { getToken } from "../services/authService";
import axios from "axios";

import "../styles/AdminFileManager.css";

function AdminFileManager() {
  const [files, setFiles] = useState([]);
  const [fileStats, setFileStats] = useState({ totalFiles: 0, totalSize: 0, typeDistribution: [] });
  const [previewFile, setPreviewFile] = useState(null);
  const [error, setError] = useState(null);

  const fetchFiles = useCallback(async () => {
    try {
      await axios.get("http://192.168.1.189:8000/api/synchroniser_fichiers/", {
        headers: { Authorization: `Token ${getToken()}` },
      });

      const response = await getCentralizedFiles();
      setFiles(response);

      const totalSize = response.reduce((acc, file) => acc + file.size, 0);
      const typeDistribution = response.reduce((acc, file) => {
        const ext = file.fichier.split(".").pop().toLowerCase();
        acc[ext] = (acc[ext] || 0) + 1;
        return acc;
      }, {});

      setFileStats({
        totalFiles: response.length,
        totalSize,
        typeDistribution: Object.entries(typeDistribution).map(([key, value]) => ({
          name: key.toUpperCase(),
          value,
        })),
      });
    } catch (e) {
      console.error("Erreur récupération fichiers :", e.response || e.message);
      setError("Erreur lors de la récupération des fichiers.");
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDelete = async (fileId) => {
    Swal.fire({
      title: "Supprimer ?",
      text: "Cette action est irréversible.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Oui, supprimer",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await deleteFile(fileId);
          setFiles((prev) => prev.filter((f) => f.id !== fileId));
          Swal.fire("Supprimé !", "Le fichier a été supprimé.", "success");
          fetchFiles();
        } catch {
          setError("Erreur lors de la suppression.");
        }
      }
    });
  };

  const handleUpdate = async (fileId, currentName) => {
    const newName = prompt("Nouveau nom :", currentName);
    if (!newName || newName.trim() === currentName) return;
    try {
      await updateFile(fileId, { fichier_nom: newName.trim() });
      fetchFiles();
    } catch {
      alert("Erreur lors du renommage.");
    }
  };

  const handleDownload = (url) => {
    const cleanUrl = url.replace(/\/media\/+/g, "/media/");
    const link = document.createElement("a");
    link.href = cleanUrl;
    link.download = cleanUrl.split("/").pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderFilePreview = () => {
    if (!previewFile) return null;
    const ext = previewFile.fichier.split(".").pop().toLowerCase();
    if (ext === "pdf") return <embed src={previewFile.fichier} type="application/pdf" width="100%" height="500px" />;
    if (["jpg", "jpeg", "png"].includes(ext)) return <img src={previewFile.fichier} alt="aperçu" style={{ width: "100%" }} />;
    return <p>Type non supporté : {ext}</p>;
  };

  const renderFileStats = () => {
    const colors = ["#8884d8", "#82ca9d", "#ffc658", "#d0ed57"];
    return (
      <div className="file-stats">
        <div className="stats-card"><h3>Total Fichiers</h3><p>{fileStats.totalFiles}</p></div>
        <div className="stats-card"><h3>Taille Totale</h3><p>{(fileStats.totalSize / 1024 / 1024).toFixed(2)} MB</p></div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={fileStats.typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
              {fileStats.typeDistribution.map((entry, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div>
      <h2>Serveur de stockage - Gestion Admin</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {renderFileStats()}
      {renderFilePreview()}
      <table>
        <thead><tr><th>Nom</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td>{f.fichier}</td>
              <td>{f.date_validation}</td>
              <td>
                <button onClick={() => handleUpdate(f.id, f.fichier.split("/").pop())}>Renommer</button>
                <button onClick={() => handleDelete(f.id)}>Supprimer</button>
                <button onClick={() => handleDownload(f.fichier)}>Télécharger</button>
                <button onClick={() => setPreviewFile(f)}>Lire</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminFileManager;
