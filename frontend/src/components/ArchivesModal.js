// src/components/ArchivesModal.js
import React, { useEffect, useState } from "react";
import Toast from "./Toast";
import "../styles/ArchivesModal.css";
import {
  getArchives,
  downloadArchive,
  deleteArchive,
  createArchive,
  unarchive,
  deleteAllArchives,
  bulkCreateArchive,
} from "../services/archiveService";
import { listFolders } from "../services/folderService";

export default function ArchivesModal({ onClose, onRefreshFolders, userInfo, onRefreshNotifications }) {
  const [archives, setArchives] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [archiveFormat, setArchiveFormat] = useState("zip");
  const [toast, setToast] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [activeTab, setActiveTab] = useState("create");

  // === Charger les archives et dossiers ===
  const fetchData = async () => {
    try {
      setLoading(true);
      const [archivesData, foldersData] = await Promise.all([
        getArchives(),
        listFolders(),
      ]);
      setArchives(archivesData);
      setFolders(foldersData);
    } catch (err) {
      console.error("❌ Erreur chargement des données :", err);
      setToast({
        type: "error",
        message: "⚠️ Erreur lors du chargement des données.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // === Création d’une archive ===
  const handleCreateArchive = async () => {
    if (!selectedFolder) {
      return setToast({
        type: "error",
        message: "⚠️ Veuillez sélectionner un dossier à archiver.",
      });
    }

    await confirmArchiveCreation();
  };

  const confirmArchiveCreation = async () => {
    setCreating(true);
    try {
      const payload = { format: archiveFormat };
      await createArchive(selectedFolder, payload);
      await fetchData();
      if (onRefreshFolders) onRefreshFolders();
      if (onRefreshNotifications) onRefreshNotifications();
      setToast({
        type: "success",
        message: `✅ Archive .${archiveFormat} créée avec succès !`,
      });
    } catch (err) {
      console.error("❌ Erreur création archive :", err);
      setToast({
        type: "error",
        message:
          err.response?.data?.error ||
          "❌ Une erreur est survenue lors de la création de l’archive.",
      });
    } finally {
      setCreating(false);
      setSelectedFolder("");
    }
  };

  // === Suppression de toutes les archives ===
  const handleDeleteAll = async () => {
    try {
      const res = await deleteAllArchives();
      await fetchData();
      setToast({ type: "success", message: `🗑️ ${res.message}` });
    } catch (err) {
      setToast({ type: "error", message: "❌ Erreur suppression toutes les archives." });
    } finally {
      setConfirmDeleteAll(false);
    }
  };

  // === Suppression d’une archive ===
  const handleDelete = async (id) => {
    try {
      await deleteArchive(id);
      await fetchData();
      setToast({ type: "success", message: "🗑️ Archive supprimée." });
    } catch (err) {
      setToast({ type: "error", message: "❌ Erreur suppression." });
    } finally {
      setConfirmDeleteId(null);
    }
  };

  // === Désarchiver un dossier ===
  const handleUnarchive = async (id) => {
    try {
      await unarchive(id);
      await fetchData();
      if (onRefreshFolders) onRefreshFolders();
      setToast({
        type: "success",
        message: "♻️ Dossier désarchivé avec succès.",
      });
    } catch (err) {
      console.error("❌ Erreur désarchivage :", err);
      setToast({
        type: "error",
        message: "❌ Impossible de désarchiver ce dossier.",
      });
    }
  };

  // === Téléchargement ===
  const handleDownload = async (id, name) => {
    if (downloadingId === id) return;
    setDownloadingId(id);
    setDownloadProgress(0);

    try {
      await downloadArchive(id, name, (percent) => {
        setDownloadProgress(percent);
      });
    } catch (err) {
      console.error("❌ Erreur téléchargement :", err);
      setToast({
        type: "error",
        message: "❌ Erreur lors du téléchargement de l’archive.",
      });
    } finally {
      setTimeout(() => {
        setDownloadingId(null);
        setDownloadProgress(0);
      }, 1200);
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const filteredArchives = archives.filter((a) =>
    a.folder_name.toLowerCase().includes(searchTerm)
  );

  // === Formatage intelligent ===
  function formatExpiration(dateStr) {
    if (!dateStr) return "—";
    const expiration = new Date(dateStr);
    const now = new Date();
    const diffMs = expiration - now;
    if (diffMs <= 0) return "expirée";
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    if (diffDays > 0)
      return `expire dans ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
    if (diffHours > 0)
      return `expire dans ${diffHours} heure${diffHours > 1 ? "s" : ""}`;
    return "expire bientôt";
  }

  function formatSize(sizeInBytes) {
    if (!sizeInBytes || sizeInBytes <= 0) return "0 Mo";
    const units = ["octets", "Ko", "Mo", "Go", "To"];
    let size = sizeInBytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  return (
    <div className="archive-modal-overlay">
      <div className="archive-modal-content">
        <div className="archive-modal-header">
          <h3>📦 Archives</h3>
          <button className="archive-close-btn" onClick={onClose}>✖</button>
        </div>

        {/* Onglets */}
        <div className="archive-tabs">
          <button className={`archive-tab${activeTab === "create" ? " active" : ""}`}
            onClick={() => setActiveTab("create")}>
            📦 Créer
          </button>
          <button className={`archive-tab${activeTab === "list" ? " active" : ""}`}
            onClick={() => setActiveTab("list")}>
            📋 Mes archives {archives.length > 0 && <span className="tab-badge">{archives.length}</span>}
          </button>
        </div>

        {/* Onglet Créer */}
        {activeTab === "create" && (
          <div className="archive-tab-content">
            <div className="archive-mode-toggle">
              <button className={`btn-mode${!bulkMode ? " active" : ""}`}
                onClick={() => { setBulkMode(false); setSelectedFolders([]); setSelectAll(false); setSelectedFolder(""); }}>
                📦 Dossier unique
              </button>
              <button className={`btn-mode${bulkMode ? " active" : ""}`}
                onClick={() => { setBulkMode(true); setSelectedFolder(""); setSelectedFolders([]); setSelectAll(false); }}>
                ☑️ Sélection multiple
              </button>
            </div>

            {!bulkMode ? (
              <div className="archive-single">
                <select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)}>
                  <option value="">-- Sélectionner un dossier --</option>
                  {folders.filter((f) => f.proprietaire?.id === userInfo?.id).map((f) => (
                    <option key={f.id} value={f.id}>{f.nom}</option>
                  ))}
                </select>
                <select className="format-select" value={archiveFormat} onChange={(e) => setArchiveFormat(e.target.value)}>
                  <option value="zip">.zip</option>
                  <option value="rar">.rar</option>
                </select>
                <button className="btn-create" onClick={handleCreateArchive} disabled={!selectedFolder || creating}>
                  {creating ? "⏳..." : "📦 Créer"}
                </button>
              </div>
            ) : (
              <div className="archive-bulk">
                <div className="bulk-header">
                  <label className="bulk-select-all">
                    <input type="checkbox" checked={selectAll} onChange={(e) => {
                      setSelectAll(e.target.checked);
                      setSelectedFolders(e.target.checked ? folders.filter(f => f.proprietaire?.id === userInfo?.id).map(f => f.id) : []);
                    }} />
                    Tout sélectionner ({folders.filter(f => f.proprietaire?.id === userInfo?.id).length})
                  </label>
                  <select className="format-select" value={archiveFormat} onChange={(e) => setArchiveFormat(e.target.value)}>
                    <option value="zip">.zip</option>
                    <option value="rar">.rar</option>
                  </select>
                </div>
                <div className="bulk-folder-list">
                  {folders.filter(f => f.proprietaire?.id === userInfo?.id).map(f => (
                    <label key={f.id} className="bulk-folder-item">
                      <input type="checkbox" checked={selectedFolders.includes(f.id)}
                        onChange={(e) => {
                          setSelectedFolders(prev =>
                            e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id)
                          );
                          if (!e.target.checked) setSelectAll(false);
                        }}
                      />
                      📁 {f.nom}
                    </label>
                  ))}
                </div>
                <button className="btn-create" disabled={selectedFolders.length === 0 || creating}
                  onClick={async () => {
                    setCreating(true);
                    try {
                      const res = await bulkCreateArchive(selectedFolders, archiveFormat);
                      await fetchData();
                      if (onRefreshNotifications) onRefreshNotifications();
                      setSelectedFolders([]);
                      setSelectAll(false);
                      setActiveTab("list");
                      setToast({ type: "success", message: `✅ ${res.created} archive(s) créée(s).` });
                    } catch (err) {
                      setToast({ type: "error", message: "❌ Erreur archivage multiple." });
                    } finally {
                      setCreating(false);
                    }
                  }}
                >
                  {creating ? "⏳ Création..." : `📦 Archiver (${selectedFolders.length})`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Onglet Mes archives */}
        {activeTab === "list" && (
          <div className="archive-tab-content">
            <div className="archive-list-header">
              <input type="text" className="archive-search"
                placeholder="🔍 Rechercher une archive..."
                onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
              />
              {archives.length > 0 && (
                <button className="btn-delete-all" onClick={() => setConfirmDeleteAll(true)}>
                  🗑️ Tout effacer
                </button>
              )}
            </div>

            <div className="archive-list large-scroll">
              {loading ? (
                <div className="spinner" />
              ) : filteredArchives.length === 0 ? (
                <p className="no-archive">Aucune archive trouvée.</p>
              ) : (
                filteredArchives.map((a) => (
                  <div key={a.id} className={`archive-item fade-in${new Date(a.expires_at) < new Date() ? " expired" : ""}`}>
                    <div className="archive-info">
                      <h4>
                        {a.type_archive === "zip" && "📦 "}
                        {a.type_archive === "rar" && "📚 "}
                        {a.folder_name}
                      </h4>
                      <p className="archive-meta">
                        🕒 Créée le {new Date(a.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} | 💾 {formatSize(a.size)} • ⏳ {formatExpiration(a.expires_at)}
                      </p>
                    </div>
                    <div className="archive-actions">
                      <button title="Télécharger" className={`btn-download${downloadingId === a.id ? " downloading" : ""}`}
                        onClick={() => handleDownload(a.id, a.folder_name)} disabled={downloadingId === a.id}>
                        {downloadingId === a.id ? `⬇️ ${downloadProgress}%` : "📥"}
                      </button>
                      <button title="Désarchiver" className="btn-unarchive"
                        onClick={() => handleUnarchive(a.id)} disabled={downloadingId === a.id}>
                        ♻️
                      </button>
                      <button title="Supprimer" className="btn-delete"
                        onClick={() => setConfirmDeleteId(a.id)} disabled={downloadingId === a.id}>
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Modales confirmation */}
        {confirmDeleteId && (
          <div className="archive-confirm-overlay">
            <div className="archive-confirm-box">
              <p>🗑️ Supprimer cette archive définitivement ?</p>
              <div className="archive-confirm-actions">
                <button className="btn-cancel-confirm" onClick={() => setConfirmDeleteId(null)}>Annuler</button>
                <button className="btn-delete-confirm" onClick={() => handleDelete(confirmDeleteId)}>Supprimer</button>
              </div>
            </div>
          </div>
        )}

        {confirmDeleteAll && (
          <div className="archive-confirm-overlay">
            <div className="archive-confirm-box">
              <p>🗑️ Supprimer toutes vos archives définitivement ?</p>
              <div className="archive-confirm-actions">
                <button className="btn-cancel-confirm" onClick={() => setConfirmDeleteAll(false)}>Annuler</button>
                <button className="btn-delete-confirm" onClick={handleDeleteAll}>Tout supprimer</button>
              </div>
            </div>
          </div>
        )}

        {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      </div>
    </div>
  );
}
