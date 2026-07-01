// src/components/FileManager.js
import React, { useState, useEffect, useCallback } from "react";
import {
  getFilesByFolder,
  uploadFile,
  deleteFile,
  previewFile,
  renameFile,
} from "../services/fileService";
import { updateSharePermission } from "../services/folderService";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import Modal from "./Modal";
import Toast from "./Toast";
import "../styles/FileManager.css";

/*import ReactPlayer from "react-player";
import AudioPlayer from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css"; */

import API_BASE_URL from "../config";

function FileManager({ activeFolder, setActiveFolder, userInfo, sidebarCollapsed = false, folders = [], onRefreshNotifications = null }) {
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [previewFileData, setPreviewFileData] = useState(null);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFullPreview, setIsFullPreview] = useState(false);
  const [notif, setNotif] = useState(null);
  const [toast, setToast] = useState(null);

  // Modales fichiers
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState(null);
  const [newFileName, setNewFileName] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [fileSortBy, setFileSortBy] = useState("date_desc");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");

  // Réinitialiser filtres quand le dossier actif change
  React.useEffect(() => {
    setFileSearch("");
    setFileSortBy("date_desc");
    setFileTypeFilter("all");
  }, [activeFolder?.id]);

  // ── Breadcrumb ────────────────────────────────────────────────
  const folderMap = React.useMemo(() => {
    const map = {};
    const traverse = (list) => {
      list.forEach(f => {
        map[f.id] = f;
        if (f.children?.length) traverse(f.children);
      });
    };
    traverse(folders);
    return map;
  }, [folders]);

  const filteredFiles = React.useMemo(() => {
    let result = [...files];
    // Filtre par recherche
    if (fileSearch.trim()) {
      result = result.filter(f =>
        f.nom.toLowerCase().includes(fileSearch.toLowerCase())
      );
    }
    // Filtre par type
    if (fileTypeFilter !== "all") {
      const typeMap = {
        documents: ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv"],
        images: ["jpg", "jpeg", "png", "gif", "webp", "svg"],
        videos: ["mp4", "mkv", "avi", "mov"],
        audio: ["mp3", "wav"],
      };
      const exts = typeMap[fileTypeFilter] || [];
      result = result.filter(f => {
        const ext = f.nom.split(".").pop()?.toLowerCase();
        return exts.includes(ext);
      });
    }
    // Tri
    result.sort((a, b) => {
      if (fileSortBy === "name_asc") return a.nom.localeCompare(b.nom);
      if (fileSortBy === "name_desc") return b.nom.localeCompare(a.nom);
      if (fileSortBy === "size_asc") return (a.taille || 0) - (b.taille || 0);
      if (fileSortBy === "size_desc") return (b.taille || 0) - (a.taille || 0);
      if (fileSortBy === "date_asc") return new Date(a.updated_at) - new Date(b.updated_at);
      return new Date(b.updated_at) - new Date(a.updated_at); // date_desc par défaut
    });
    return result;
  }, [files, fileSearch, fileSortBy, fileTypeFilter]);

  const breadcrumb = React.useMemo(() => {
    if (!activeFolder) return [];
    const chain = [];
    let current = folderMap[activeFolder.id] || activeFolder;
    while (current) {
      chain.unshift(current);
      current = current.parent ? folderMap[current.parent] : null;
    }
    return chain;
  }, [activeFolder, folderMap]);

  const rootSharedFolder = React.useMemo(() => {
    for (const f of breadcrumb) {
      if (f.is_shared && f.shares?.length > 0) return f;
    }
    return null;
  }, [breadcrumb]);

  // Nouvelle modale pour permissions refusées
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");

  const [shareInfoOpen, setShareInfoOpen] = useState(false);

  useEffect(() => {
    if (activeFolder) fetchFiles();
  }, [activeFolder]);

  
    // Déclare refreshActiveFolder AVANT handlePermissionChange
    const refreshActiveFolder = async () => {
      if (!activeFolder) return;
      try {
        const res = await fetch(`${API_BASE_URL}/folders/`, {
          headers: { Authorization: `Token ${localStorage.getItem("token")}` },
        });
        if (res.ok) {
          const folders = await res.json();
          const updated = folders.find((f) => f.id === activeFolder.id);
          if (updated) setActiveFolder(updated);
        }
      } catch (err) {
        console.error("❌ Erreur refresh dossier", err);
      }
    };


    //Mise à jour permission
    const handlePermissionChange = async (shareId, permission, value) => {
      try {
        const res = await updateSharePermission(shareId, { [permission]: value });

        setActiveFolder((prev) => ({
          ...prev,
          shares: prev.shares.map((s) =>
            s.id === shareId ? { ...s, [permission]: value } : s
          ),
        }));

        setNotif({
          type: "success",
          title: "Succès ✅",
          message: res.message,
        });

        const timestamp = new Date().toISOString(); // au lieu de "now"

        setNotif({
          type: "success",
          title: "Succès ✅",
          message: `Permission mise à jour avec succès à ${new Date(timestamp).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          created_at: timestamp,
        });


        // Toast de confirmation de mise à jour
        setToast({
          type: "success",
          message: "Permission mise à jour avec succès !",
        });
        setTimeout(() => setToast(null), 3000);

        // Rafraîchir dossier actif immédiatement
        await refreshActiveFolder();
      } catch (err) {
        console.error("❌ Erreur mise à jour permission", err);
        setNotif({
          type: "error",
          title: "Erreur ⛔",
          message: "Impossible de mettre à jour cette permission.",
        });
      }
    };


      const fetchFiles = async () => {
        try {
          const data = await getFilesByFolder(activeFolder.id);
          setFiles(data);
        } catch (err) {
          console.error("❌ Erreur récupération fichiers", err);
        }
      };

      // === Upload de fichiers ===
      const handleUpload = async (selectedFiles) => {
        if (!activeFolder.permissions?.can_write) {
          setPermissionMessage("⛔ Vous n’avez pas la permission d’ajouter un fichier dans ce dossier.");
          setPermissionModalOpen(true);
          return;
        }

        try {
          // Upload parallèle des fichiers
          await Promise.all(
            Array.from(selectedFiles).map((file) => uploadFile(activeFolder.id, file))
          );

          // Rafraîchit la liste après upload
          await fetchFiles();

          // Affiche un toast de confirmation
          const fileCount = selectedFiles.length;
          setToast({
            type: "success",
            message: `${fileCount} fichier${fileCount > 1 ? "s" : ""} uploadé${fileCount > 1 ? "s" : ""} avec succès !`,
          });

          // Cache le toast automatiquement après 3 secondes
          setTimeout(() => setToast(null), 3000);

        } catch (err) {
          console.error("❌ Erreur upload", err);
          const msg = err?.response?.data?.error || "❌ Erreur upload.";
          setNotif({
            type: "error",
            title: "Upload refusé",
            message: msg === "Type de fichier non autorisé"
              ? "Format non supporté. Formats acceptés : PDF, Word, Excel, CSV, PNG, JPG, MP4, MP3."
              : msg,
          });
        }
      };


      // Suppression
      const handleDeleteRequest = (file) => {
        if (!activeFolder.permissions?.can_delete) {
          setPermissionMessage("⛔ Vous n’avez pas la permission de supprimer ce fichier.");
          setPermissionModalOpen(true);
          return;
        }
        setFileToDelete(file);
        setFileModalOpen(true);
      };

      const confirmDeleteFile = async () => {
        try {
          await deleteFile(fileToDelete.id);
          setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
          if (onRefreshNotifications) onRefreshNotifications();
        } catch (err) {
          console.error("❌ Erreur suppression fichier", err);
          setPermissionMessage("⛔ Suppression impossible.");
          setPermissionModalOpen(true);
        } finally {
          setFileModalOpen(false);
          setFileToDelete(null);
        }
      };

      // Renommage
      const handleRenameRequest = (file) => {
        if (!activeFolder.permissions?.can_update) {
          setPermissionMessage("⛔ Vous n’avez pas la permission de renommer ce fichier.");
          setPermissionModalOpen(true);
          return;
        }
        setFileToRename(file);
        setNewFileName(file.nom);
        setRenameModalOpen(true);
      };

      const confirmRenameFile = async () => {
        try {
          const updated = await renameFile(fileToRename.id, newFileName);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileToRename.id ? { ...f, nom: updated.nom } : f
            )
          );
          if (onRefreshNotifications) onRefreshNotifications();
        } catch (err) {
          console.error("❌ Erreur renommage fichier", err);
          setPermissionMessage("⛔ Impossible de renommer ce fichier.");
          setPermissionModalOpen(true);
        } finally {
          setRenameModalOpen(false);
          setFileToRename(null);
          setNewFileName("");
        }
      };

      // Drag & drop
      const handleDrop = useCallback(
        (e) => {
          e.preventDefault();
          setDragOver(false);
          const droppedFiles = e.dataTransfer.files;
          if (droppedFiles.length > 0) handleUpload(droppedFiles);
        },
        [activeFolder]
      );

      // Fonction utilitaire : choisit une icône selon l’extension
      const getFileIcon = (fileName) => {
        const ext = fileName.split(".").pop().toLowerCase();

        if (["mp3", "wav", "ogg"].includes(ext)) return "🎵"; // audio
        if (["mp4", "mkv", "avi", "mov"].includes(ext)) return "🎥"; // vidéo
        if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) return "🖼️"; // image
        if (["pdf"].includes(ext)) return "📕"; // PDF
        if (["doc", "docx"].includes(ext)) return "📄"; // Word
        if (["xls", "xlsx", "csv"].includes(ext)) return "📊"; // Excel/CSV
        if (["ppt", "pptx"].includes(ext)) return "📑"; // PowerPoint
        if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️"; // archives
        return "📁"; // par défaut
      };


      // Preview fichiers
      const handlePreview = async (file) => {
        if (previewMeta && previewMeta.id === file.id) return;
        try {
          const data = await previewFile(file.id);
          const fileName = file.nom.toLowerCase();

          if (fileName.endsWith(".docx")) {
            const response = await fetch(data.url);
            const arrayBuffer = await response.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            setPreviewFileData({ type: "text", content: result.value });
          } else if (fileName.match(/\.(xlsx|xls)$/)) {
            const response = await fetch(data.url);
            const arrayBuffer = await response.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            setPreviewFileData({ type: "table", rows });
          } else {
            setPreviewFileData(data);
          }
          setPreviewMeta(file);
          setIsPreviewOpen(true);
          setIsFullPreview(true);

        } catch (err) {
          console.error("❌ Erreur preview fichier", err);
          setPermissionMessage("Impossible de prévisualiser ce fichier.");
          setPermissionModalOpen(true);
        }
      };

        // 🔄 Auto-refresh toutes les 10s
        useEffect(() => {
          const interval = setInterval(() => {
            refreshActiveFolder();
          }, 10000); // 10 secondes
          return () => clearInterval(interval);
        }, [activeFolder]);


        return (
          <div className={`file-manager ${isFullPreview ? "full-preview-mode" : ""}`}>
            {/* Zone d’upload */}
            {!isFullPreview && (
              <div
                className={`upload-zone ${dragOver ? "drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {activeFolder.permissions?.can_write ? (
                  <div className="upload-compact-bar">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                      stroke="currentColor" width="18" height="18">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
                    </svg>
                    <span>Déposer un fichier ici ou</span>
                    <label htmlFor="file-upload" className="upload-compact-btn">
                      Parcourir
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      onChange={(e) => handleUpload(e.target.files)}
                      style={{ display: "none" }}
                    />
                  </div>
                ) : (
                  <div className="upload-compact-bar upload-compact-denied">
                    ⛔ Permission insuffisante pour uploader dans ce dossier.
                  </div>
                )}
              </div>
            )}

            {/* Modale infos de partage */}
            {shareInfoOpen && (
              <Modal
                title={`📤 Infos de partage : ${activeFolder.nom}`}
                onClose={() => setShareInfoOpen(false)}
                onConfirm={() => setShareInfoOpen(false)}
                confirmText="Fermer"
                className="share-info-modal"
                showCancel={false}
              >
                {activeFolder.is_shared && activeFolder.shares?.length > 0 ? (
                  <ul className="share-info-list">
                    {activeFolder.shares.map((share) => (
                      <li key={share.id} className="share-info-item">
                        <span className="share-username">👤 {share.user.username}</span>

                        {activeFolder.proprietaire?.id === userInfo?.id ? (
                          <div className="share-perms-checkboxes">
                            <label className="perm perm-read">
                              <input
                                type="checkbox"
                                checked={share.can_read}
                                onChange={(e) =>
                                  handlePermissionChange(share.id, "can_read", e.target.checked)
                                }
                              />
                              📖 Lire Fichiers
                            </label>
                            <label className="perm perm-write">
                              <input
                                type="checkbox"
                                checked={share.can_write}
                                onChange={(e) =>
                                  handlePermissionChange(share.id, "can_write", e.target.checked)
                                }
                              />
                              ✍️ Ajouter Fichiers
                            </label>
                            <label className="perm perm-update">
                              <input
                                type="checkbox"
                                checked={share.can_update}
                                onChange={(e) =>
                                  handlePermissionChange(share.id, "can_update", e.target.checked)
                                }
                              />
                              ✏️ Renommer Fichiers
                            </label>
                            <label className="perm perm-delete">
                              <input
                                type="checkbox"
                                checked={share.can_delete}
                                onChange={(e) =>
                                  handlePermissionChange(share.id, "can_delete", e.target.checked)
                                }
                              />
                              🗑️ Supprimer Fichiers
                            </label>
                            <label className="perm perm-delete-folder">
                              <input
                                type="checkbox"
                                checked={share.can_delete_folder}
                                onChange={(e) =>
                                  handlePermissionChange(share.id, "can_delete_folder", e.target.checked)
                                }
                              />
                              📂 Supprimer Dossier
                            </label>
                          </div>
                        ) : (
                          <div className="share-perms-tags">
                            {share.can_read && <span className="perm-tag perm-read">📖 Lire</span>}
                            {share.can_write && <span className="perm-tag perm-write">✍️ Ajouter</span>}
                            {share.can_update && <span className="perm-tag perm-update">✏️ Renommer</span>}
                            {share.can_delete && <span className="perm-tag perm-delete">🗑️ Supprimer</span>}
                            {share.can_delete_folder && (
                              <span className="perm-tag perm-delete-folder">📂 Supprimer Dossier</span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-share">📂 Ce dossier est privé et non partagé.</p>
                )}
              </Modal>
            )}

            {/* Contenu du dossier (caché si preview) */}
            {!isFullPreview && (
              <div className="file-content-scroll">
                <h3 className="folder-title">
                  📑 Contenu du dossier :{" "}
                  {breadcrumb.map((crumb, index) => (
                    <span key={crumb.id}>
                      {index > 0 && <span className="breadcrumb-sep"> › </span>}
                      <span
                        className={`folder-name-clickable${index === breadcrumb.length - 1 ? " breadcrumb-active" : " breadcrumb-link"}`}
                        onClick={() => {
                          if (index < breadcrumb.length - 1) {
                            setActiveFolder(crumb);
                          }
                        }}
                      >
                        {crumb.nom}
                      </span>
                    </span>
                  ))}
                  {rootSharedFolder?.proprietaire ? (
                    <span className="shared-info">
                      (🤝 partagé par {rootSharedFolder.proprietaire.username}
                      {" le " +
                        new Date(rootSharedFolder.shares?.[0]?.shared_at).toLocaleDateString("fr-FR") +
                        " à " +
                        new Date(rootSharedFolder.shares?.[0]?.shared_at).toLocaleTimeString("fr-FR")}
                      )
                    </span>
                  ) : (
                    <span className="private-info">(📂 Privé)</span>
                  )}
                </h3>

                {files.length > 0 && (
                  <div className="file-filters-bar">
                    <input
                      className="file-filter-search"
                      placeholder="🔍 Rechercher un fichier..."
                      value={fileSearch}
                      onChange={e => setFileSearch(e.target.value)}
                    />
                    <select
                      className="file-filter-select"
                      value={fileTypeFilter}
                      onChange={e => setFileTypeFilter(e.target.value)}
                    >
                      <option value="all">Tous les types</option>
                      <option value="documents">📄 Documents</option>
                      <option value="images">🖼️ Images</option>
                      <option value="videos">🎬 Vidéos</option>
                      <option value="audio">🎵 Audio</option>
                    </select>
                    <select
                      className="file-filter-select"
                      value={fileSortBy}
                      onChange={e => setFileSortBy(e.target.value)}
                    >
                      <option value="date_desc">📅 Plus récent</option>
                      <option value="date_asc">📅 Plus ancien</option>
                      <option value="name_asc">🔤 Nom A-Z</option>
                      <option value="name_desc">🔤 Nom Z-A</option>
                      <option value="size_desc">📦 Plus grand</option>
                      <option value="size_asc">📦 Plus petit</option>
                    </select>
                  </div>
                )}
                {files.length > 0 ? (
                  <ul className="file-list">
                    {filteredFiles.map((file) => (
                      <li key={file.id} className="file-item">
                        <span className="file-name" onClick={() => handlePreview(file)}>
                          <span className="file-icon">{getFileIcon(file.nom)}</span> {file.nom}
                        </span>

                        <div className="file-actions">
                          {activeFolder.permissions?.can_update && (
                          <button
                            className="rename-btn"
                            title="Renommer"
                            onClick={() => handleRenameRequest(file)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232a2.5 2.5 0 013.536 3.536L7.5 20.036H4v-3.5L15.232 5.232z" />
                            </svg>
                          </button>
                          )}

                          {activeFolder.permissions?.can_delete && (
                          <button
                            className="delete-btn"
                            title="Supprimer"
                            onClick={() => handleDeleteRequest(file)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V4h6v3m2 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7z" />
                            </svg>
                          </button>
                          )}
                        </div>

                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucun fichier dans ce dossier.</p>
                )}

              </div>
            )}

            {/*PREVIEW EN MODE PLEIN ÉCRAN - MODERNE ET FLUIDE */}
            {previewFileData && previewMeta && (
              <div className="file-preview-container" style={{ left: sidebarCollapsed ? "48px" : "240px" }}>
                {/* Bande supérieure flottante */}
                <div className="preview-topbar">
                  <h4 className="preview-title">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      fill="none"
                      stroke="#6c63ff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ marginRight: "8px" }}
                    >
                      <path d="M12 20h9" />
                      <path d="M12 4h9" />
                      <rect x="3" y="4" width="9" height="16" rx="2" />
                    </svg>
                    Aperçu de : <span>{previewMeta.nom}</span>
                  </h4>

                  {/* Bouton de fermeture SVG stylé */}
                  <button
                    className="close-preview-btn"
                    onClick={() => {
                      setPreviewFileData(null);
                      setPreviewMeta(null);
                      setIsPreviewOpen(false);
                      setIsFullPreview(false);
                    }}
                    title="Fermer la prévisualisation"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Zone principale de contenu */}
                <div className="file-preview-content">
                  {previewFileData.type === "text" && (
                    <pre className="text-preview">{previewFileData.content}</pre>
                  )}

                  {previewFileData.type === "table" && (
                    <div className="table-wrapper">
                      <table className="csv-preview">
                        <tbody>
                          {previewFileData.rows.map((row, idx) => (
                            <tr key={idx}>
                              {row.map((cell, i) => (
                                <td key={i}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {previewFileData.type === "url" && (
                    <>
                      {previewMeta.nom.toLowerCase().endsWith(".pdf") ? (
                        <iframe src={previewFileData.url} title="aperçu-pdf" />
                      ) : (
                        <iframe src={previewFileData.url} title="aperçu" />
                      )}
                    </>
                  )}

                  {previewFileData.type === "audio" && (
                    <div className="audio-preview">
                      <audio className="custom-audio" controls style={{ width: "100%" }}>
                        <source
                          src={previewFileData.url}
                          type={`audio/${previewMeta.nom.split(".").pop()}`}
                        />
                        Votre navigateur ne supporte pas l’audio.
                      </audio>
                    </div>
                  )}

                  {previewFileData.type === "video" && (
                    <div className="video-preview">
                      <video
                        className="custom-video"
                        controls
                        style={{ width: "100%", maxHeight: "85vh" }}
                      >
                        <source
                          src={previewFileData.url}
                          type={`video/${previewMeta.nom.split(".").pop()}`}
                        />
                        Votre navigateur ne supporte pas la vidéo.
                      </video>
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* Modales diverses */}
            {fileModalOpen && (
              <Modal
                title="Supprimer le fichier"
                onClose={() => setFileModalOpen(false)}
                onConfirm={confirmDeleteFile}
                confirmText="Supprimer"
                showCancel={true}
              >
                <p>
                  Voulez-vous vraiment supprimer{" "}
                  <strong>{fileToDelete?.nom}</strong> ?
                </p>
              </Modal>
            )}

            {renameModalOpen && (
              <Modal
                title="Renommer le fichier"
                onClose={() => setRenameModalOpen(false)}
                onConfirm={confirmRenameFile}
                confirmText="Renommer"
                showCancel={true}
              >
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Nouveau nom du fichier"
                />
              </Modal>
            )}

            {permissionModalOpen && (
              <Modal
                title="Action non autorisée"
                onClose={() => setPermissionModalOpen(false)}
                onConfirm={() => setPermissionModalOpen(false)}
                confirmText="OK"
                className="alert-modal"
                showCancel={false}
              >
                <p>{permissionMessage}</p>
              </Modal>
            )}

            {toast && (
              <Toast
                type={toast.type}
                message={toast.message}
                onClose={() => setToast(null)}
              />
            )}

            {notif && (
              <Toast
                type={notif.type}
                message={notif.message}
                onClose={() => setNotif(null)}
              />
            )}
          </div>
        );

    }


export default FileManager;
