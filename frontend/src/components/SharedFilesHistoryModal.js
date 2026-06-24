// src/components/SharedFilesHistoryModal.js
import React, { useState, useEffect } from "react";
import API_BASE_URL from "../config";
import "../styles/SharedFilesHistoryModal.css";

export default function SharedFilesHistoryModal({ onClose, onOpen }) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [sharedBy, setSharedBy] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sharedByList, setSharedByList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [goToPage, setGoToPage] = useState("");

  const fetchData = async ({ p = 1, s = search, sb = sharedBy, df = dateFrom, dt = dateTo } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: p, page_size: pageSize,
        ...(s && { search: s }),
        ...(sb && { shared_by: sb }),
        ...(df && { date_from: df }),
        ...(dt && { date_to: dt }),
      });
      const res = await fetch(`${API_BASE_URL}/shared-files/?${params}`, {
        headers: { Authorization: `Token ${localStorage.getItem("token")}` },
      });
      const json = await res.json();
      setData(json.results || []);
      setTotal(json.total || 0);
      setTotalPages(Math.ceil((json.total || 0) / pageSize));
      setSharedByList(json.shared_by_list || []);
    } catch (err) {
      console.error("Erreur historique", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData({ p: page }); }, []);

  const handleFilter = () => {
    setPage(1);
    fetchData({ p: 1, s: search, sb: sharedBy, df: dateFrom, dt: dateTo });
  };

  const handleReset = () => {
    setSearch(""); setSharedBy(""); setDateFrom(""); setDateTo("");
    setPage(1);
    fetchData({ p: 1, s: "", sb: "", df: "", dt: "" });
  };

  const handleExportCSV = () => {
    const headers = ["Nom", "Partagé par", "Date de partage"];
    const rows = data.map(f => [f.nom, f.shared_by, new Date(f.shared_at).toLocaleString("fr-FR")]);
    const csv = [headers, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "historique_partages.csv";
    link.click(); URL.revokeObjectURL(url);
  };

  const goFirst = () => { setPage(1); fetchData({ p: 1 }); };
  const goPrev = () => { const p = Math.max(1, page - 1); setPage(p); fetchData({ p }); };
  const goNext = () => { const p = Math.min(totalPages, page + 1); setPage(p); fetchData({ p }); };
  const goLast = () => { setPage(totalPages); fetchData({ p: totalPages }); };
  const handleGoTo = () => {
    const p = parseInt(goToPage);
    if (p >= 1 && p <= totalPages) { setPage(p); fetchData({ p }); setGoToPage(""); }
  };

  return (
    <div className="sfh-overlay">
      <div className="sfh-modal">
        <div className="sfh-header">
          <h3>📜 Historique des fichiers partagés</h3>
          <button className="sfh-close" onClick={onClose}>✖</button>
        </div>

        {/* Filtres */}
        <div className="sfh-filters">
          <input className="sfh-input" placeholder="🔍 Rechercher un fichier..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleFilter()} />
          <select className="sfh-select" value={sharedBy} onChange={e => setSharedBy(e.target.value)}>
            <option value="">Tous les expéditeurs</option>
            {sharedByList.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <input className="sfh-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input className="sfh-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <button className="sfh-btn sfh-btn-filter" onClick={handleFilter}>🔍 Filtrer</button>
          <button className="sfh-btn sfh-btn-reset" onClick={handleReset}>↺ Réinitialiser</button>
          <button className="sfh-btn sfh-btn-csv" onClick={handleExportCSV}>⬇️ CSV</button>
        </div>

        {/* Total */}
        <div className="sfh-total">
          <span>{total} fichier{total > 1 ? "s" : ""} partagé{total > 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <div className="sfh-table-wrapper">
          {loading ? (
            <div className="spinner" />
          ) : data.length === 0 ? (
            <p className="sfh-empty">Aucun fichier partagé trouvé.</p>
          ) : (
            <table className="sfh-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nom du fichier</th>
                  <th>Partagé par</th>
                  <th>Date de partage</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.map((f, idx) => (
                  <tr key={f.id}>
                    <td>{(page - 1) * pageSize + idx + 1}</td>
                    <td className="sfh-filename">{f.nom}</td>
                    <td>{f.shared_by}</td>
                    <td>{f.shared_at ? new Date(f.shared_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                    <td>
                      <button className="sfh-btn-open" onClick={() => { onOpen(f); onClose(); }}>
                        📂 Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="sfh-pagination">
            <button onClick={goFirst} disabled={page === 1} title="Première">⏮</button>
            <button onClick={goPrev} disabled={page === 1} title="Précédent">←</button>
            <span>Page {page} / {totalPages}</span>
            <button onClick={goNext} disabled={page === totalPages} title="Suivant">→</button>
            <button onClick={goLast} disabled={page === totalPages} title="Dernière">⏭</button>
            <div className="sfh-goto">
              <input type="number" min="1" max={totalPages} value={goToPage}
                onChange={e => setGoToPage(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleGoTo()}
                placeholder="Aller à" />
              <button onClick={handleGoTo}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
