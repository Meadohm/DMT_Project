// src/services/AdminFileManager.js
import React, { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { getCentralizedFiles, updateFile, deleteFile } from "../services/adminService";
import { getToken } from "../services/authService";
import API_BASE_URL from "../config";
import axios from "axios";
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import "../styles/AdminFileManager.css";

const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
  csv: '📋', txt: '📃', zip: '🗜️', rar: '🗜️',
};

const getIcon = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || '📁';
};

const getCleanName = (filepath) => {
  return filepath.split('/').pop();
};

const getMediaUrl = (filepath) => {
  if (!filepath) return '';
  if (filepath.startsWith('http')) {
    try {
      const url = new URL(filepath);
      const path = url.pathname.replace(/^\/media\//, '');
      const base = API_BASE_URL.replace(':8000/api', '').replace('/api', '');
      return `${base}/media/${path}`;
    } catch (e) {
      return filepath;
    }
  }
  const base = API_BASE_URL.replace(':8000/api', '').replace('/api', '');
  return `${base}/media/${filepath}`;
};

const PAGE_SIZE = 15;
const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#d0ed57', '#ff8042', '#a4de6c'];

function AdminFileManager() {
  const [files, setFiles] = useState([]);
  const [fileStats, setFileStats] = useState({ totalFiles: 0, totalSize: 0, typeDistribution: [] });
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [renameModal, setRenameModal] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [toast, setToast] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewContent, setPreviewContent] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [diskUsage, setDiskUsage] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const handleTooltipShow = (e, text) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text, x: rect.left, y: rect.top });
  };

  const handleTooltipHide = () => setTooltip(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchFiles = useCallback(async () => {
    try {
      await axios.get(`${API_BASE_URL}/synchroniser_fichiers/`, {
        headers: { Authorization: `Token ${getToken()}` },
      });
      const response = await getCentralizedFiles();
      const data = response.data || response;
      setFiles(data);
      const totalSize = data.reduce((acc, f) => acc + (f.size || 0), 0);
      const typeDist = data.reduce((acc, f) => {
        const ext = (f.fichier || '').split('.').pop().toLowerCase();
        acc[ext] = (acc[ext] || 0) + 1;
        return acc;
      }, {});
      setFileStats({
        totalFiles: data.length,
        totalSize,
        typeDistribution: Object.entries(typeDist).map(([k, v]) => ({ name: k.toUpperCase(), value: v })),
      });
      try {
        const diskRes = await axios.get(`${API_BASE_URL}/disk-usage/`, {
          headers: { Authorization: `Token ${getToken()}` },
        });
        setDiskUsage(diskRes.data);
      } catch (e) {
        console.error('Disk usage error', e);
      }
    } catch (e) {
      setError('Erreur lors de la récupération des fichiers.');
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleDelete = async (id) => {
    try {
      await deleteFile(id);
      showToast('Fichier supprimé.');
      setConfirmDeleteId(null);
      fetchFiles();
    } catch {
      showToast('Erreur lors de la suppression.', 'error');
      setConfirmDeleteId(null);
    }
  };

  const handleRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === renameModal.currentName) {
      setRenameModal(null);
      return;
    }
    try {
      await updateFile(renameModal.id, { fichier_nom: renameValue.trim() });
      setFiles(prev => prev.map(file =>
        file.id === renameModal.id ? { ...file, nom: renameValue.trim() } : file
      ));
      showToast('Fichier renommé.');
      setRenameModal(null);
    } catch {
      showToast('Erreur lors du renommage.', 'error');
    }
  };

  const handleDownload = async (filepath) => {
    const url = getMediaUrl(filepath);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filepath.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      showToast('Téléchargement lancé.');
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  const loadPreviewContent = async (f) => {
    const ext = f.fichier.split('.').pop().toLowerCase();
    const url = getMediaUrl(f.fichier);
    setPreviewContent(null);
    setPreviewLoading(true);
    try {
      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
        setPreviewContent({ type: 'spreadsheet', html });
      } else if (['docx', 'doc'].includes(ext)) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setPreviewContent({ type: 'document', html: result.value });
      } else {
        setPreviewContent(null);
      }
    } catch (e) {
      setPreviewContent({ type: 'error', html: '' });
    }
    setPreviewLoading(false);
  };

  const filtered = files.filter(f => {
    const name = getCleanName(f.fichier || '').toLowerCase();
    const owner = (f.utilisateur || '').toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || owner.includes(search.toLowerCase());
    const fileDate = f.date_validation ? f.date_validation.split('/').reverse().join('-') : '';
    const matchDebut = dateDebut ? fileDate >= dateDebut : true;
    const matchFin = dateFin ? fileDate <= dateFin : true;
    return matchSearch && matchDebut && matchFin;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderPreview = () => {
    if (!previewFile) return null;
    const ext = previewFile.fichier.split('.').pop().toLowerCase();
    const mediaUrl = getMediaUrl(previewFile.fichier);
    const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

    const ActionButtons = () => (
      <div style={{display:'flex', gap:'12px', justifyContent:'center', marginTop:'12px', paddingTop:'12px', borderTop:'1px solid #e8edf2'}}>
        <button className="btn-primary" onClick={() => handleDownload(previewFile.fichier)}>
          ⬇️ Télécharger
        </button>
        <button className="btn-cancel" onClick={() => setPreviewFile(null)}>
          ✕ Fermer
        </button>
      </div>
    );

    return (
      <div className="modal-overlay" onClick={() => setPreviewFile(null)}>
        <div className="modal-box modal-box-large" onClick={e => e.stopPropagation()} style={{display:'flex', flexDirection:'column', maxHeight:'90vh'}}>
          <h3>👁️ Aperçu — {getCleanName(previewFile.fichier)}</h3>
          <div style={{flex:1, overflow:'auto', minHeight:0}}>
            {ext === 'pdf' && (
              <embed src={mediaUrl} type="application/pdf" width="100%" height="420px" />
            )}
            {imageExts.includes(ext) && (
              <img src={mediaUrl} alt="aperçu" style={{width:'100%', borderRadius:'8px', maxHeight:'420px', objectFit:'contain'}} />
            )}
            {officeExts.includes(ext) && (
              <div>
                {previewLoading && (
                  <div style={{textAlign:'center', padding:'40px', color:'#666'}}>⏳ Chargement...</div>
                )}
                {!previewLoading && previewContent?.type === 'spreadsheet' && (
                  <div style={{maxHeight:'360px', overflowY:'auto', overflowX:'auto', border:'1px solid #e0e0e0', borderRadius:'6px', fontSize:'0.82em'}}
                    dangerouslySetInnerHTML={{ __html: previewContent.html }} />
                )}
                {!previewLoading && previewContent?.type === 'document' && (
                  <div style={{maxHeight:'360px', overflowY:'auto', padding:'16px', border:'1px solid #e0e0e0', borderRadius:'6px', fontSize:'0.88em', lineHeight:'1.6', background:'white'}}
                    dangerouslySetInnerHTML={{ __html: previewContent.html }} />
                )}
                {!previewLoading && previewContent?.type === 'error' && (
                  <p style={{textAlign:'center', color:'#dc3545', padding:'20px'}}>Erreur lors du chargement.</p>
                )}
              </div>
            )}
            {!['pdf', ...imageExts, ...officeExts].includes(ext) && (
              <p style={{textAlign:'center', padding:'20px', color:'#666'}}>
                Aperçu non disponible pour ce type ({ext.toUpperCase()})
              </p>
            )}
          </div>
          <ActionButtons />
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="section-header">
        <h2>Espace de stockage</h2>
        <span className="user-count-badge">{filtered.length} / {files.length} fichier{files.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <div className="error-box"><p>{error}</p></div>}

      <div className="file-stats-modern">
        <div className="stat-card-modern">
          <span className="stat-icon">📁</span>
          <div>
            <div className="stat-value">{fileStats.totalFiles}</div>
            <div className="stat-label">Fichiers total</div>
          </div>
        </div>
        <div className="stat-card-modern">
          <span className="stat-icon">💾</span>
          <div>
            <div className="stat-value">{(fileStats.totalSize / 1024 / 1024).toFixed(2)} MB</div>
            <div className="stat-label">Espace fichiers</div>
          </div>
        </div>
        {diskUsage && (
          <>
            <div className="stat-card-modern">
              <span className="stat-icon">🟢</span>
              <div>
                <div className="stat-value">{(diskUsage.free / 1024 / 1024 / 1024).toFixed(1)} GB</div>
                <div className="stat-label">Espace libre</div>
              </div>
            </div>
            <div className="stat-card-modern">
              <span className="stat-icon">📊</span>
              <div>
                <div className="stat-value">{Math.round((diskUsage.used / diskUsage.total) * 100)}%</div>
                <div className="stat-label">Disque utilisé</div>
              </div>
            </div>
          </>
        )}
        <div className="stat-card-modern stat-chart">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={fileStats.typeDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={40}
                label={({ name, value }) => `${name}:${value}`}
                labelLine={true}
                fontSize={10}
              >
                {fileStats.typeDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} fichier(s)`, name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="historique-filters">
        <input
          className="historique-search"
          placeholder="Rechercher par nom ou propriétaire..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <input type="date" className="historique-date" value={dateDebut} onChange={e => { setDateDebut(e.target.value); setPage(1); }} title="Date début" />
        <input type="date" className="historique-date" value={dateFin} onChange={e => { setDateFin(e.target.value); setPage(1); }} title="Date fin" />
        <button className="btn-cancel" onClick={() => { setSearch(''); setDateDebut(''); setDateFin(''); setPage(1); }}>Réinitialiser</button>
      </div>

      <div className="users-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Nom du fichier</th>
              <th>Propriétaire</th>
              <th>Date</th>
              <th>Taille</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((f, index) => {
              const cleanName = getCleanName(f.fichier || '');
              const icon = getIcon(cleanName);
              const ext = cleanName.split('.').pop().toUpperCase();
              const size = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '—';
              return (
                <tr key={f.id}>
                  <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td><span className="file-type-badge">{icon} {ext}</span></td>
                  <td className="file-name-cell">
                    <span
                      className="objet-text"
                      onMouseEnter={(e) => handleTooltipShow(e, f.nom || cleanName)}
                      onMouseLeave={handleTooltipHide}
                    >
                      {f.nom || cleanName}
                    </span>
                  </td>
                  <td>{f.utilisateur || '—'}</td>
                  <td>{f.date_validation}</td>
                  <td>{size}</td>
                  <td>
                    <button className="edit-user-button" onClick={() => { setRenameModal({ id: f.id, currentName: f.nom || cleanName }); setRenameValue(f.nom || cleanName); }}>Renommer</button>
                    <button className="btn-primary" style={{padding:'5px 8px',fontSize:'0.78em',marginRight:'3px'}} onClick={() => { setPreviewFile(f); loadPreviewContent(f); }}>Aperçu</button>
                    <button className="reset-password-button" onClick={() => handleDownload(f.fichier)}>Télécharger</button>
                    <button className="delete-user-button" onClick={() => setConfirmDeleteId(f.id)}>Supprimer</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="btn-cancel" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
        <span className="pagination-info">Page {page} / {totalPages}</span>
        <button className="btn-cancel" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
      </div>

      {confirmDeleteId && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>⚠️ Supprimer ce fichier ?</h3>
            <p>Cette action est <strong>irréversible</strong>.</p>
            <div className="modal-actions">
              <button className="btn-danger" onClick={() => handleDelete(confirmDeleteId)}>Supprimer</button>
              <button className="btn-cancel" onClick={() => setConfirmDeleteId(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {renameModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>✏️ Renommer le fichier</h3>
            <div className="form-group" style={{marginTop:'12px'}}>
              <label>Nouveau nom</label>
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                style={{padding:'10px',border:'1px solid #dde3ea',borderRadius:'6px',width:'100%',boxSizing:'border-box'}}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleRename}>Renommer</button>
              <button className="btn-cancel" onClick={() => setRenameModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {renderPreview()}

      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✅' : '❌'}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y - 40,
          background: '#003366',
          color: 'white',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '0.82em',
          maxWidth: '320px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 99999,
          pointerEvents: 'none',
          lineHeight: '1.4',
          whiteSpace: 'normal',
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export default AdminFileManager;
