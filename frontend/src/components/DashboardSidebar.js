// src/components/DashboardSidebar.js
import React, { useRef, useState } from "react";
import FolderTree from "./FolderTree";
import ContextMenu from "./ContextMenu";
import "../styles/FileManager.css";
import "../styles/SidebarGemini.css";
import logo from "../assets/dmt.png";

/**
 * DashboardSidebar — Sidebar partagée Employé / Responsable
 *
 * Props :
 *  collapsed           bool
 *  onToggle            () => void
 *  myFolders           array
 *  sharedFolders       array
 *  favoriteFolders     array
 *  activeFolder        object | null
 *  onSelect            (folder) => void
 *  favorites           array
 *  onToggleFavorite    (id) => void
 *  onCreateFolder      () => void
 *  onCreateSubfolder   (parentId, name) => Promise
 *  onRenameFolder      (folder) => void
 *  onDeleteFolder      (folder) => void
 *  onShareFolder       (folder) => void
 *  onDeleteShared      (folder) => Promise
 *  role                'employe' | 'responsable'
 */
function DashboardSidebar({
  collapsed,
  onToggle,
  myFolders = [],
  sharedFolders = [],
  favoriteFolders = [],
  activeFolder,
  onSelect,
  favorites = [],
  onToggleFavorite,
  onCreateFolder,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onShareFolder,
  onDeleteShared,
  onLeaveFolder,
  role = "employe",
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showAllShared, setShowAllShared] = useState(false);
  const [confirmLeaveFolder, setConfirmLeaveFolder] = useState(null);
  const SHARED_LIMIT = 10;
  const menuRefs = useRef({});

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}${role === "responsable" ? " sidebar-teal" : ""}`}>
      <div className="sidebar-top-fixed">
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          title={collapsed ? "Déplier" : "Replier"}
        >
          <span>{collapsed ? "▶" : "◀"}</span>
        </button>

        {!collapsed && (
          <button className="new-folder-btn" onClick={onCreateFolder}>
            + Nouveau
          </button>
        )}
      </div>

      <div className="sidebar-layout-fix">

        {/* ⭐ Favoris */}
        <h4 className="sidebar-section">⭐ Favoris</h4>
        <div className="section-scroll">
          {favoriteFolders.length === 0 ? (
            <p className="no-folder-msg1">Aucun favori</p>
          ) : (
            <ul className="folder-list">
              {favoriteFolders.map((folder) => (
                <li
                  key={folder.id}
                  className={`${
                    activeFolder?.id === folder.id ? "active" : ""
                  } favorite`}
                  onClick={() => onSelect(folder)}
                  title={folder.nom}
                >
                  📂 <span className="folder-name">{folder.nom}</span>
                  <button
                    className="star"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(folder.id);
                    }}
                    title="Retirer des favoris"
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 📂 Mes dossiers */}
        <h4 className="sidebar-section">📂 Mes dossiers</h4>
        <div className="section-scroll">
          {myFolders.length === 0 ? (
            <p className="no-folder-msg1">Aucun dossier</p>
          ) : (
            myFolders
              .filter((f) => !f.parent)
              .map((folder) => (
                <FolderTree
                  key={folder.id}
                  folder={folder}
                  activeFolder={activeFolder}
                  onSelect={onSelect}
                  onCreateSubfolder={onCreateSubfolder}
                  onRename={onRenameFolder}
                  onDelete={onDeleteFolder}
                  onShare={onShareFolder}
                  onToggleFavorite={onToggleFavorite}
                  isFavorite={favorites.includes(folder.id)}
                />
              ))
          )}
        </div>

        {/* 🤝 Partagés avec moi / 🏢 Dossiers service */}
        <h4 className="sidebar-section">
          {role === "responsable" ? "🏢 Dossiers service" : "🤝 Partagés avec moi"}
        </h4>
        <div className="section-scroll">
          {sharedFolders.length === 0 ? (
            <p className="no-folder-msg1">Aucun dossier partagé</p>
          ) : (
            <ul className="folder-list">
              {(showAllShared ? sharedFolders : sharedFolders.slice(0, SHARED_LIMIT)).map((folder) => {
                const canDeleteFolder =
                  folder.share_permissions?.can_delete_folder ??
                  folder.permissions?.can_delete_folder ??
                  folder.shares?.[0]?.can_delete_folder ??
                  folder.can_delete_folder ??
                  false;

                return (
                  <li
                    key={folder.id}
                    className={activeFolder?.id === folder.id ? "active" : ""}
                    onClick={() => onSelect(folder)}
                    data-title={folder.nom}
                  >
                    <div className="folder-item">
                      <span className="folder-icon">📂</span>
                      <span className="folder-name" data-title={folder.nom}>
                        {folder.nom}
                      </span>

                      <div className="folder-actions">
                        <button
                          className={`star ${
                            favorites.includes(folder.id) ? "active" : "inactive"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(folder.id);
                          }}
                          title={
                            favorites.includes(folder.id)
                              ? "Retirer des favoris"
                              : "Ajouter aux favoris"
                          }
                        >
                          {favorites.includes(folder.id) ? "⭐" : "☆"}
                        </button>

                        <div
                          className="folder-menu-wrapper"
                          onClick={(e) => e.stopPropagation()}
                          ref={(el) => (menuRefs.current[folder.id] = el)}
                        >
                          <button
                            className="context-btn"
                            title="Options"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimeout(() => {
                                setOpenMenuId((prev) =>
                                  prev === folder.id ? null : folder.id
                                );
                              }, 0);
                            }}
                          >
                            ⋮
                          </button>

                          {openMenuId === folder.id && (
                            <ContextMenu
                              anchorRef={menuRefs.current[folder.id]}
                              onDelete={canDeleteFolder ? async () => { await onDeleteShared(folder); setOpenMenuId(null); } : null}
                              onLeave={() => { setConfirmLeaveFolder(folder); setOpenMenuId(null); }}
                              onClose={() => setOpenMenuId(null)}
                              mode="shared"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {sharedFolders.length > SHARED_LIMIT && (
            <button
              className="btn-voir-plus"
              onClick={() => setShowAllShared(prev => !prev)}
            >
              {showAllShared
                ? "▲ Réduire"
                : `▼ Voir plus (${sharedFolders.length - SHARED_LIMIT})`}
            </button>
          )}
        </div>

      </div>

      <div className="sidebar-logo-bottom">
        <img src={logo} alt="DMT Logo" className="app-logoEmp" />
      </div>

      {confirmLeaveFolder && (
        <div className="archive-confirm-overlay">
          <div className="archive-confirm-box">
            <p>🚪 Quitter le dossier <strong>{confirmLeaveFolder.nom}</strong> ?</p>
            <small style={{ color: "#888", display: "block", marginBottom: "16px" }}>
              Vous perdrez l'accès à ce dossier partagé.
            </small>
            <div className="archive-confirm-actions">
              <button className="btn-cancel-confirm" onClick={() => setConfirmLeaveFolder(null)}>
                Annuler
              </button>
              <button className="btn-delete-confirm" onClick={async () => {
                await onLeaveFolder(confirmLeaveFolder);
                setConfirmLeaveFolder(null);
              }}>
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default DashboardSidebar;