/* FolderTree.js — version optimisée (parent/enfant + menu child, Oct 2025) */
/* eslint-disable no-unused-expressions */
import React, { useState, useRef, useEffect } from "react";
import ContextMenu from "./ContextMenu";
import "../styles/FolderTree.css";

/* === Helpers LocalStorage === */
const getSavedExpansion = () => {
  try {
    return JSON.parse(localStorage.getItem("expandedFolders")) || [];
  } catch {
    return [];
  }
};

const saveExpansion = (ids) => {
  localStorage.setItem("expandedFolders", JSON.stringify(ids));
};

/* === Fonction de tri récursif === */
const sortFolders = (folders) => {
  if (!folders) return [];
  return folders
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((f) => ({
      ...f,
      children: sortFolders(f.children),
    }));
};

function FolderTree({
  folder,
  activeFolder,
  onSelect,
  onCreateSubfolder,
  onRename,
  onDelete,
  onShare,
  onToggleFavorite,
  isFavorite,
  showOwner = false,
  contextMode = null,
  onLeave = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  /* === Expansion automatique === */
  useEffect(() => {
    const saved = getSavedExpansion();
    if (saved.includes(folder.id)) setExpanded(true);
  }, [folder.id]);

  /* === Sauvegarde état expansion === */
  useEffect(() => {
    const saved = getSavedExpansion();
    if (expanded && !saved.includes(folder.id)) {
      saveExpansion([...saved, folder.id]);
    } else if (!expanded && saved.includes(folder.id)) {
      saveExpansion(saved.filter((id) => id !== folder.id));
    }
  }, [expanded, folder.id]);

  /* === Fermeture clic extérieur === */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* === Restauration expansion depuis localStorage === */
  useEffect(() => {
    const handler = (e) => {
      const saved = e.detail;
      if (saved.includes(folder.id)) setExpanded(true);
    };
    window.addEventListener("restore-expansion", handler);
    return () => window.removeEventListener("restore-expansion", handler);
  }, [folder.id]);

  const handleToggleExpand = (e) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  const sortedChildren = sortFolders(folder.children || []);

  useEffect(() => {
    const updateTooltipCoords = (e) => {
      document.documentElement.style.setProperty("--tooltip-x", `${e.clientX}px`);
      document.documentElement.style.setProperty("--tooltip-y", `${e.clientY}px`);
    };

    // 🔄 On écoute sur tout le document pour couvrir tous les FolderTree (y compris “Partagés avec moi”)
    document.addEventListener("mousemove", updateTooltipCoords);

    return () => document.removeEventListener("mousemove", updateTooltipCoords);
  }, []);




  return (
    <div className="folder-tree">
      <div
        className={`folder-node ${activeFolder?.id === folder.id ? "active" : ""}`}
        onClick={() => onSelect(folder)}
        //title={folder.nom}
      >
        {/* ▶ Flèche si enfants */}
        {sortedChildren.length > 0 && (
          <span
            className={`arrow ${expanded ? "expanded" : ""}`}
            onClick={handleToggleExpand}
            title={expanded ? "Réduire" : "Développer"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="arrow-icon"
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </span>
        )}

        {/* 📁 Icône + Nom */}
        <span className="folder-icon">📁</span>
        <div className="folder-name-block">
          <span
            className="folder-name"
            data-title={folder.nom}
          >
            {folder.nom}
          </span>
          {showOwner && folder.proprietaire?.username && (
            <span className="folder-owner-badge">
              par {folder.proprietaire.username}
            </span>
          )}
        </div>


        {/* === Actions === */}
        <div className="folder-actions">
          {/* ⭐ Favori : uniquement pour parent */}
          {!folder.parent ? (
            <button
              className={`star ${isFavorite ? "active" : "inactive"}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(folder.id);
              }}
              title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              {isFavorite ? "⭐" : "☆"}
            </button>
          ) : (
            <button className="star disabled" title="Favori désactivé" disabled>
              ☆
            </button>
          )}

          {/* ➕ visible uniquement pour les dossiers racine */}
          {!folder.parent && (
            <button
              className="add-subfolder"
              title="Créer un sous-dossier"
              onClick={(e) => {
                e.stopPropagation();
                const modal = document.createElement("div");
                modal.className = "subfolder-modal";
                modal.innerHTML = `
                  <div class="modal-overlay">
                    <div class="modal-content">
                      <h3>Créer un sous-dossier 📁</h3>
                      <input type="text" id="subfolderName" placeholder="Nom du sous-dossier" />
                      <div class="modal-actions">
                        <button id="cancelSub" class="cancel-btn">Annuler</button>
                        <button id="confirmSub" class="confirm-btn">Créer</button>
                      </div>
                    </div>
                  </div>
                `;
                document.body.appendChild(modal);

                const input = modal.querySelector("#subfolderName");
                input.focus();
                modal.querySelector("#cancelSub").onclick = () => modal.remove();
                modal.querySelector("#confirmSub").onclick = () => {
                  const name = input.value.trim();
                  if (name) {
                    onCreateSubfolder(folder.id, name);
                    modal.remove();
                  } else {
                    input.classList.add("input-error");
                  }
                };
              }}
            >
              ➕
            </button>
          )}

          {/* ⋮ Menu contextuel */}
          <div className="folder-menu-wrapper" ref={menuRef}>
            <button
              className="context-btn"
              title="Options"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
            >
              ⋮
            </button>

            {menuOpen && (
              <ContextMenu
                anchorRef={menuRef}
                onRename={() => onRename(folder)}
                onShare={() => onShare(folder)}
                onDelete={() => onDelete(folder)}
                onLeave={onLeave}
                onClose={() => setMenuOpen(false)}
                mode={contextMode && folder.parent ? "none" : contextMode || (folder.parent ? "child" : "owner")}
              />
            )}
          </div>
        </div>
      </div>

      {/* === Sous-dossiers === */}
      {expanded && sortedChildren.length > 0 && (
        <div className="folder-children fade-expand">
          {sortedChildren.map((child) => (
            <FolderTree
              key={child.id}
              folder={child}
              activeFolder={activeFolder}
              onSelect={onSelect}
              onCreateSubfolder={onCreateSubfolder}
              onRename={onRename}
              onDelete={onDelete}
              onShare={onShare}
              onToggleFavorite={onToggleFavorite}
              isFavorite={isFavorite}
              contextMode={contextMode}
              onLeave={onLeave}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default FolderTree;
