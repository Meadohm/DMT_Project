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
  mobileOpen = false,
  onMobileClose,
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
  externalFolders = [],
  role = "employe",
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showAllShared, setShowAllShared] = useState(false);
  const [confirmLeaveFolder, setConfirmLeaveFolder] = useState(null);
  const SHARED_LIMIT = 10;
  const menuRefs = useRef({});

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}${role === "responsable" ? " sidebar-teal" : ""}${mobileOpen ? " mobile-open" : ""}`}>
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
        <h4 className="sidebar-section">⭐ Favoris {favoriteFolders.length > 0 && <span className="sidebar-section-count">{favoriteFolders.length}</span>}</h4>
        <div className="section-scroll">
          {favoriteFolders.length === 0 ? (
            <p className="no-folder-msg1">Aucun favori</p>
          ) : (
            favoriteFolders.map((folder) => {
              const isSharedExternal = externalFolders.some(f => f.id === folder.id);
              const isServiceFolder = sharedFolders.some(f => f.id === folder.id);
              const isSharedWithMe = isSharedExternal || (role === "employe" && isServiceFolder);
              const favContextMode = isSharedExternal
                ? "shared"
                : isServiceFolder && role === "responsable"
                ? "service_readonly"
                : isServiceFolder && role === "employe"
                ? "shared"
                : null;
              return (
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
                  isFavorite={true}
                  contextMode={favContextMode}
                  onLeave={isSharedWithMe ? (f) => { setConfirmLeaveFolder(f); } : null}
                />
              );
            })
          )}
        </div>

        {/* 📂 Mes dossiers */}
        <h4 className="sidebar-section">📂 Mes dossiers {myFolders.length > 0 && <span className="sidebar-section-count">{myFolders.filter(f => !f.parent).length}</span>}</h4>
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
          {sharedFolders.length > 0 && <span className="sidebar-section-count">{sharedFolders.filter(f => !f.parent).length}</span>}
        </h4>
        <div className="section-scroll">
          {sharedFolders.length === 0 ? (
            <p className="no-folder-msg1">
              {role === "responsable" ? "Aucun dossier dans ce service" : "Aucun dossier partagé"}
            </p>
          ) : role === "responsable" ? (
            sharedFolders
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
                  showOwner={true}
                  contextMode="service_readonly"
                />
              ))
          ) : (
            <>
              {(showAllShared ? sharedFolders : sharedFolders.slice(0, SHARED_LIMIT))
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
                    contextMode="shared"
                    onLeave={(f) => { setConfirmLeaveFolder(f); }}
                  />
                ))}
              {sharedFolders.length > SHARED_LIMIT && (
                <button
                  className="show-more-btn"
                  onClick={() => setShowAllShared(prev => !prev)}
                >
                  {showAllShared ? "Voir moins" : `Voir plus (${sharedFolders.length - SHARED_LIMIT})`}
                </button>
              )}
            </>
          )}
        </div>

        {role === "responsable" && (
          <>
            <h4 className="sidebar-section">🤝 Partagés avec moi {externalFolders.length > 0 && <span className="sidebar-section-count">{externalFolders.filter(f => !f.parent).length}</span>}</h4>
            <div className="section-scroll">
              {externalFolders.length === 0 ? (
                <p className="no-folder-msg1">Aucun dossier partagé</p>
              ) : (
                externalFolders
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
                      contextMode="shared"
                      onLeave={(folder) => { setConfirmLeaveFolder(folder); }}
                    />
                  ))
              )}
            </div>
          </>
        )}

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

      {mobileOpen && (
        <div className="sidebar-overlay" onClick={onMobileClose} />
      )}
    </aside>
  );
}

export default DashboardSidebar;