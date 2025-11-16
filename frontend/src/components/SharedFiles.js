// src/components/SharedFiles.js
import React, { useState, useEffect } from "react";
import "../styles/SharedFiles.css";

function SharedFiles({ files = [], onOpen, showHistory }) {
  const itemsPerPage = 10;
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(files.length / itemsPerPage);
  const visibleFiles = files.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Effet d’apparition fluide (CSS natif)
  useEffect(() => {
    const cards = document.querySelectorAll(".shared-file-card");
    cards.forEach((card, i) => {
      card.style.animation = `fadeInUp 0.45s ease-out ${i * 0.05}s forwards`;
    });
  }, [page, files]);

  return (
    <div className="shared-files-container">
      <div className="shared-files-header">
        <h3 className="shared-section-title">📤 Fichiers partagés avec moi</h3>
        {files.length > 0 && (
          <button
            className="history-btn"
            onClick={showHistory}
            title="Voir tout l’historique des fichiers partagés"
          >
            📜 Voir l’historique complet
          </button>
        )}
      </div>

      {files.length === 0 ? (
        <p className="no-shared-msg">Aucun fichier partagé récemment.</p>
      ) : (
        <>
          <div className="shared-files-list">
            {visibleFiles.map((file) => (
              <div
                key={file.id}
                className="shared-file-card"
                onClick={() => onOpen(file)}
                title="Clique pour ouvrir"
              >
                <div className="shared-file-name">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4h16v16H4z" />
                  </svg>
                  {file.nom}
                </div>

                <div className="shared-file-info">
                  <span className="shared-owner">👤 {file.shared_by}</span>
                  <span className="shared-date">
                    {new Date(file.shared_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="shared-actions">
                  <button onClick={(e) => { e.stopPropagation(); onOpen(file); }}>
                    📂 Ouvrir
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination fluide */}
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ⬅️ Précédent
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant ➡️
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SharedFiles;
