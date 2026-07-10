// src/pages/AdminPanel.js

import React, { useEffect, useState } from "react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  getUsers,
  updateUserRole,
  createUser,
  resetUserPassword,
  deleteUserAccount,
  updateUserAccount,
  createService,
  getServices,
  deleteService,
  updateService,
  toggleUserActive,
} from "../services/adminService";

import { getUser, getToken } from "../services/authService";
import { updatePassword } from "../services/passwordService";
import { validatePassword } from "../services/validators";

import { getHistorique, deleteHistorique } from "../services/fileService";
import AdminFileManager from "../services/AdminFileManager";
import HelpModalAdmin from "../components/HelpModalAdmin";
import useAutoLogout from "../hooks/useAutoLogout";

import API_BASE_URL from "../config";
import logo from "../assets/dmt.png";
import "../styles/SuperAdminPanel.css";
import useTheme from "../hooks/useTheme";
import "../styles/theme.css";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const getRelativeTime = (dateStr, isActive = true) => {
  if (!isActive) return { label: 'Inactif', type: 'inactive' };
  if (!dateStr) return { label: 'Jamais connecté', type: 'inactive' };
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 10)  return { label: 'En ligne',          type: 'online' };
  if (mins < 60)  return { label: `Il y a ${mins} min`, type: 'recent' };
  if (hours < 24) return { label: `Il y a ${hours}h`,   type: 'today' };
  if (days === 1) return { label: 'Hier',               type: 'yesterday' };
  if (days < 30)  return { label: `Il y a ${days} j`,   type: 'old' };
  return { label: `Il y a ${Math.floor(days / 30)} mois`, type: 'old' };
};

function SuperAdminPanel() {
  const [services, setServices] = useState([]);
  const [newService, setNewService] = useState("");
  const [users, setUsers] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState(
    localStorage.getItem('adminActiveSection') || "dashboard"
  );
  const [historique, setHistorique] = useState([]);
  const [trashItems, setTrashItems] = useState([]);
  const [cleanupData, setCleanupData] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [selectedCleanupIds, setSelectedCleanupIds] = useState([]);
  const [cleanupFilter, setCleanupFilter] = useState('all');
  const [cleanupSearch, setCleanupSearch] = useState('');
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [emptyTrashModal, setEmptyTrashModal] = useState(false);
  const [trashEmail, setTrashEmail] = useState('');
  const [trashPassword, setTrashPassword] = useState('');
  const [showTrashPassword, setShowTrashPassword] = useState(false);
  const [trashError, setTrashError] = useState('');
  const [trashEmptying, setTrashEmptying] = useState(false);
  const [trashSearch, setTrashSearch] = useState('');
  const [trashTypeFilter, setTrashTypeFilter] = useState('');
  const [trashPage, setTrashPage] = useState(1);
  const TRASH_PAGE_SIZE = 10;
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);
  const [confirmTrashAction, setConfirmTrashAction] = useState(null);
  // confirmTrashAction = { type: 'delete_single'|'restore_single'|'delete_selected'|'restore_selected', item: null|{id, nom} }

  const toggleTrashSelect = (id) => {
    setSelectedTrashIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllTrash = (items) => {
    if (selectedTrashIds.length === items.length) {
      setSelectedTrashIds([]);
    } else {
      setSelectedTrashIds(items.map(i => i.id));
    }
  };

  const handleRestoreSelected = async () => {
    const items = selectedTrashIds
      .map(id => trashItems.find(i => i.id === id))
      .filter(Boolean);
    if (items.length === 0) {
      setConfirmTrashAction(null);
      return;
    }
    for (const item of items) {
      const endpoint = item.item_type === 'folder'
        ? `${API_BASE_URL}/trash/${item.id}/restore-folder/`
        : `${API_BASE_URL}/trash/${item.id}/restore/`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Token ${localStorage.getItem('token')}` }
      });
    }
    setSelectedTrashIds([]);
    setConfirmTrashAction(null);
    await fetchTrash(); // Resynchroniser — inclut suppression automatique des parents
  };

  // Formulaire utilisateur
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "employe",
    service: "",
  });

  const [formError, setFormError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterService, setFilterService] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordModal, setResetPasswordModal] = useState(null);
  const [editUserData, setEditUserData] = useState({
    username: "",
    email: "",
    service: "",
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [formSuccess, setFormSuccess] = useState("");
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historiqueSearch, setHistoriqueSearch] = useState('');
  const [historiqueAction, setHistoriqueAction] = useState('');
  const [historiquePage, setHistoriquePage] = useState(1);
  const [historiqueTotal, setHistoriqueTotal] = useState(0);
  const [historiquePageInput, setHistoriquePageInput] = useState('');
  const [confirmDeleteHistoriqueId, setConfirmDeleteHistoriqueId] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmClearDeletions, setConfirmClearDeletions] = useState(false);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [auditDeletions, setAuditDeletions] = useState([]);
  const [deletionsLoading, setDeletionsLoading] = useState(false);
  const [deletionSearch, setDeletionSearch] = useState("");
  const [deletionAction, setDeletionAction] = useState("");
  const [deletionDateFrom, setDeletionDateFrom] = useState("");
  const [deletionDateTo, setDeletionDateTo] = useState("");
  const [journalTab, setJournalTab] = useState("journal");
  const [tooltip, setTooltip] = useState(null);
  const [showCreateServiceModal, setShowCreateServiceModal] = useState(false);
  const [confirmDeleteServiceId, setConfirmDeleteServiceId] = useState(null);
  const [serviceForm, setServiceForm] = useState({ nom: '', description: '', statut: 'actif', responsable_id: '' });
  const [serviceFormError, setServiceFormError] = useState('');
  const [editServiceModal, setEditServiceModal] = useState(null);
  const [editServiceForm, setEditServiceForm] = useState({ nom: '', description: '', statut: 'actif', responsable_id: '' });
  const [editServiceError, setEditServiceError] = useState('');
  const [dashboardStats, setDashboardStats] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleWarning = useCallback(() => setShowLogoutWarning(true), []);
  const handleAutoLogout = useCallback(() => { localStorage.clear(); navigate("/"); }, [navigate]);

  useAutoLogout(
    userInfo?.role || 'employe',
    handleAutoLogout,
    handleWarning
  );

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatTime = (date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  useEffect(() => {
    fetchData();
    fetchServices();
    fetchDashboardStats();
    const refreshInterval = setInterval(() => {
      fetchData();
      fetchServices();
      fetchDashboardStats();
      if (localStorage.getItem('adminActiveSection') === 'trash') {
        fetchTrash();
      }
    }, 30000);
    const section = localStorage.getItem('adminActiveSection');
    if (section === 'submissions') {
      const savedPage = parseInt(localStorage.getItem('historiquePage') || '1');
      setTimeout(() => fetchHistorique(savedPage, '', '', '', ''), 300);
      setHistoriquePage(savedPage);
    }
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const heartbeat = () => {
      axios.post(`${API_BASE_URL}/last-seen/`, {}, {
        headers: { Authorization: `Token ${token}` }
      }).catch(() => {});
    };
    heartbeat();
    const interval = setInterval(heartbeat, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('adminActiveSection', activeSection);
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'trash') fetchTrash();
    if (activeSection === 'cleanup') fetchCleanup();
  }, [activeSection]);

  const fetchCleanup = async () => {
    setCleanupLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cleanup/candidates/`, {
        headers: { Authorization: `Token ${localStorage.getItem('token')}` }
      });
      if (res.ok) setCleanupData(await res.json());
    } catch (err) {
      console.error('Erreur cleanup', err);
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleCleanupSelected = () => {
    if (selectedCleanupIds.length === 0) return;
    setConfirmCleanup(true);
  };

  const handleCleanupConfirm = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/cleanup/folders/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ folder_ids: selectedCleanupIds })
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedCleanupIds([]);
        setConfirmCleanup(false);
        await fetchCleanup();
      }
    } catch (err) {
      console.error('Erreur cleanup', err);
    }
  };

  const fetchTrash = async () => {
    setTrashLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/trash/`, {
        headers: { Authorization: `Token ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTrashItems(data.items || []);
      }
    } catch (err) {
      console.error('Erreur corbeille', err);
    } finally {
      setTrashLoading(false);
    }
  };

  const handleRestoreTrash = async (id, item_type) => {
    const endpoint = item_type === 'folder'
      ? `${API_BASE_URL}/trash/${id}/restore-folder/`
      : `${API_BASE_URL}/trash/${id}/restore/`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Token ${localStorage.getItem('token')}` }
      });
      if (res.ok) setTrashItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {}
    setConfirmTrashAction(null);
  };

  const handleEmptyTrash = async () => {
    if (trashEmptying) return;
    setTrashEmptying(true);
    setTrashError('');
    try {
      const idsToDelete = selectedTrashIds.length > 0 ? selectedTrashIds : null;
      let success = true;
      if (idsToDelete) {
        // Supprimer uniquement la sélection via credentials
        const res = await fetch(`${API_BASE_URL}/trash/empty/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Token ${localStorage.getItem('token')}` },
          body: JSON.stringify({ email: trashEmail, password: trashPassword, ids: idsToDelete })
        });
        const data = await res.json();
        if (res.ok) {
          setSelectedTrashIds([]);
        } else {
          setTrashError(data.error || 'Credentials invalides.');
          success = false;
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/trash/empty/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Token ${localStorage.getItem('token')}` },
          body: JSON.stringify({ email: trashEmail, password: trashPassword })
        });
        const data = await res.json();
        if (!res.ok) {
          setTrashError(data.error || 'Credentials invalides.');
          success = false;
        }
      }
      if (success) {
        setEmptyTrashModal(false);
        setTrashEmail('');
        setTrashPassword('');
        setTrashError('');
        await fetchTrash(); // Resynchroniser — inclut suppression automatique des parents
      }
      setTrashEmptying(false);
    } catch (err) {
      setTrashError('Erreur réseau.');
      setTrashEmptying(false);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/dashboard-stats/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setDashboardStats(res.data);
    } catch (e) {
      console.error('Erreur dashboard stats', e);
    }
  };

  const fetchServices = async () => {
    try {
      const servicesData = await getServices();
      setServices(servicesData);
    } catch (error) {
      console.error("Erreur récupération services", error);
    }
  };

  const fetchData = async () => {
    try {
      const usersData = await getUsers();
      setUsers(usersData);
      fetchUserInfo();
      const currentSection = localStorage.getItem('adminActiveSection');
      if (currentSection === 'submissions') {
        const currentPage = parseInt(localStorage.getItem('historiquePage') || '1');
        fetchHistorique(currentPage, historiqueAction, historiqueSearch, dateDebut, dateFin);
        if (journalTab === 'suppressions') {
          fetchAuditDeletions();
        }
      }
      setLoading(false);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        localStorage.clear();
        window.location.href = '/';
      } else {
        setError("Erreur récupération données");
      }
      setLoading(false);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const data = await getUser();
      setUserInfo(data);
    } catch (e) {
      setError("Erreur récupération infos utilisateur");
    }
  };

  // Historique
  const fetchHistorique = async (page = 1, action = '', search = '', debut = '', fin = '') => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page,
        ...(action && { action }),
        ...(search && { search }),
        ...(debut && { date_debut: debut }),
        ...(fin && { date_fin: fin }),
      });
      const res = await axios.get(`${API_BASE_URL}/historique/?${params}`, {
        headers: { Authorization: `Token ${token}` }
      });
      setHistorique(res.data.results);
      setHistoriqueTotal(res.data.total);
      localStorage.setItem('historiquePage', page);
    } catch (e) {
      console.error('Erreur historique', e);
    }
  };

  const fetchAuditDeletions = async () => {
    setDeletionsLoading(true);
    try {
      const token = getToken();
      const res = await axios.get(`${API_BASE_URL}/historique/deletions/`, {
        headers: { Authorization: `Token ${token}` },
      });
      setAuditDeletions(res.data);
    } catch (e) {
      console.error('Erreur suppressions journal', e);
    } finally {
      setDeletionsLoading(false);
    }
  };

  const handleDeleteHistorique = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/historique/${id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      showToast('Entrée supprimée du journal.');
      fetchHistorique(historiquePage, historiqueAction, historiqueSearch);
    } catch (e) {
      const msg = e.response?.data?.error || 'Erreur lors de la suppression.';
      showToast(msg, 'error');
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      await toggleUserActive(userId);
      const action = currentStatus ? 'désactivé' : 'activé';
      showToast(`Compte ${action}.`);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Erreur lors de la modification.', 'error');
    }
  };

  const handleExportCSV = () => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    if (historiqueAction) params.append('action', historiqueAction);
    if (historiqueSearch) params.append('search', historiqueSearch);
    if (dateDebut) params.append('date_debut', dateDebut);
    if (dateFin) params.append('date_fin', dateFin);
    const url = `${API_BASE_URL}/historique/export-csv/?${params.toString()}`;
    fetch(url, { headers: { Authorization: `Token ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `journal_activite_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Export CSV téléchargé.');
      })
      .catch(() => showToast('Erreur lors de l\'export.', 'error'));
  };

  const handleClearDeletions = async () => {
    try {
      const token = getToken();
      await axios.delete(`${API_BASE_URL}/historique/deletions/clear/`, {
        headers: { Authorization: `Token ${token}` },
      });
      setAuditDeletions([]);
      showToast('Suppressions nettoyées.', 'success');
    } catch (e) {
      showToast('Erreur lors du nettoyage.', 'error');
    } finally {
      setConfirmClearDeletions(false);
    }
  };

  const handleClearAllHistorique = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/historique/clear/`, {
        headers: { Authorization: `Token ${token}` }
      });
      showToast('Journal d\'activité effacé.');
      fetchHistorique(1, '', '');
      setHistoriqueSearch('');
      setHistoriqueAction('');
      setConfirmClearAll(false);
    } catch (e) {
      showToast('Erreur lors de la suppression.', 'error');
      setConfirmClearAll(false);
    }
  };

  // Gestion mot de passe
  const handlePasswordChange = async () => {
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      setPasswordError(errors);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(["Les mots de passe ne correspondent pas."]);
      return;
    }
    try {
      await updatePassword(oldPassword, newPassword);
      showToast('Mot de passe changé avec succès.');
      handleLogout();
    } catch (error) {
      setPasswordError([error.message]);
    }
  };

  const handlePasswordVisibilityToggle = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${process.env.REACT_APP_API_URL || 'http://192.168.1.116:8000/api'}/logout/`, {
          method: 'POST',
          headers: { Authorization: `Token ${token}` }
        });
      }
    } catch (e) {}
    localStorage.clear();
    window.location.replace("/");
  };

  // Gestion utilisateurs
  const handleUpdateRole = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e) {
      setError("Erreur mise à jour rôle");
    }
  };

  const handleDeleteUser = async (id) => {
    const token = getToken();
    try {
      await deleteUserAccount(id, token);
      setUsers(users.filter(u => u.id !== id));
      setConfirmDeleteId(null);
      showToast('Utilisateur supprimé.');
    } catch {
      showToast('Erreur lors de la suppression.', 'error');
      setConfirmDeleteId(null);
    }
  };

  const handleResetPassword = async (id, username) => {
    setResettingId(id);
    try {
      const result = await resetUserPassword(id);
      setResetPasswordModal({
        username,
        newPassword: result.new_password,
        emailEnvoye: result.email_envoye,
      });
      showToast(`Mot de passe de "${username}" réinitialisé.`);
    } catch {
      showToast("Erreur lors de la réinitialisation.", 'error');
    } finally {
      setResettingId(null);
    }
  };

  const handleEditStart = (u) => {
    setEditingUser(u.id);
    setEditUserData({ username: u.username, email: u.email || "", service: u.service || "" });
  };

  const handleEditSubmit = async (userId) => {
    try {
      await updateUserAccount(userId, editUserData);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...editUserData } : u)));
      setEditingUser(null);
      showToast('Utilisateur mis à jour.');
    } catch (e) {
      const msg = e.response?.data?.error || 'Erreur mise à jour utilisateur';
      showToast(msg, 'error');
    }
  };

  // Gestion services
  const handleUpdateService = async (e) => {
    e.preventDefault();
    setEditServiceError('');
    if (!editServiceForm.nom.trim()) {
      setEditServiceError('Le nom est obligatoire.');
      return;
    }
    try {
      await updateService(editServiceModal.id, editServiceForm);
      showToast(`Service "${editServiceForm.nom}" mis à jour.`);
      setEditServiceModal(null);
      fetchServices();
    } catch (err) {
      setEditServiceError(err.response?.data?.error || 'Erreur lors de la mise à jour.');
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    setServiceFormError('');
    if (!serviceForm.nom.trim()) {
      setServiceFormError('Le nom est obligatoire.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/services/create/`, serviceForm, {
        headers: { Authorization: `Token ${token}` }
      });
      showToast(`Service "${serviceForm.nom}" créé.`);
      setServiceForm({ nom: '', description: '', statut: 'actif', responsable_id: '' });
      setShowCreateServiceModal(false);
      fetchServices();
    } catch (err) {
      setServiceFormError(err.response?.data?.error || 'Erreur lors de la création.');
    }
  };

  const handleDeleteService = async (id) => {
    try {
      await deleteService(id);
      showToast('Service supprimé.');
      setConfirmDeleteServiceId(null);
      fetchServices();
    } catch {
      showToast('Erreur lors de la suppression.', 'error');
      setConfirmDeleteServiceId(null);
    }
  };

  // Gestion création utilisateur
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (formData.password !== formData.confirmPassword) {
      setFormError('Les mots de passe ne correspondent pas.');
      return false;
    }
    if (formData.password.length < 6) {
      setFormError('Le mot de passe doit contenir au moins 6 caractères.');
      return false;
    }
    try {
      await createUser(formData);
      setFormSuccess(`Utilisateur "${formData.username}" créé avec succès.`);
      showToast(`Utilisateur "${formData.username}" créé avec succès.`);
      setFormData({ username: '', email: '', password: '', confirmPassword: '', role: 'employe', service: '' });
      fetchData();
      return true;
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erreur lors de la création.');
      return false;
    }
  };

  const handleTooltipShow = (e, text) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text, x: rect.left, y: rect.top });
  };

  const handleTooltipHide = () => setTooltip(null);

  const filteredUsers = users
    .filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(u => filterRole ? u.role === filterRole : true)
    .filter(u => filterService ? u.service === filterService : true)
    .filter(u => {
      if (!filterStatus) return true;
      const diff = u.last_seen ? Date.now() - new Date(u.last_seen).getTime() : Infinity;
      if (filterStatus === "online") return diff < 600000 && u.is_active;
      if (filterStatus === "offline") return diff >= 600000 && u.is_active;
      if (filterStatus === "inactive") return !u.is_active;
      if (filterStatus === "never") return !u.last_seen;
      return true;
    })
    .sort((a, b) => {
      if (a.id === userInfo?.id) return -1;
      if (b.id === userInfo?.id) return 1;
      return 0;
    });

  const filteredDeletions = auditDeletions
    .filter(d => deletionSearch ?
      d.admin?.toLowerCase().includes(deletionSearch.toLowerCase()) ||
      d.deleted_utilisateur?.toLowerCase().includes(deletionSearch.toLowerCase()) ||
      d.deleted_objet?.toLowerCase().includes(deletionSearch.toLowerCase())
      : true)
    .filter(d => deletionAction ? d.deleted_action === deletionAction : true)
    .filter(d => deletionDateFrom ? new Date(d.deleted_at) >= new Date(deletionDateFrom) : true)
    .filter(d => deletionDateTo ? new Date(d.deleted_at) <= new Date(deletionDateTo + 'T23:59:59') : true);

  if (loading) return <p>Chargement...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div className={`admin-panel-container ${theme === "dark" ? "dark" : ""}`}>
      <aside className={`admin-sidebar${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Déplier' : 'Replier'}>
          {sidebarCollapsed ? '→' : '←'}
        </button>
        <button className={activeSection === "dashboard" ? "active" : ""} onClick={() => setActiveSection("dashboard")}>📊 Tableau de bord</button>
        <button className={activeSection === "users" ? "active" : ""} onClick={() => setActiveSection("users")}>Gestion utilisateurs</button>
        <button className={activeSection === "files" ? "active" : ""} onClick={() => setActiveSection("files")}>Gestion fichiers</button>
        <button className={activeSection === "submissions" ? "active" : ""} onClick={() => { setActiveSection("submissions"); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>Journal d'activité</button>
        <button className={activeSection === "createService" ? "active" : ""} onClick={() => setActiveSection("createService")}>Créer un service</button>
        <button className={activeSection === "trash" ? "active" : ""} onClick={() => { setActiveSection("trash"); fetchTrash(); }}> 🗑️ Corbeille</button>
        <button className={activeSection === "cleanup" ? "active" : ""} onClick={() => { setActiveSection("cleanup"); fetchCleanup(); }}>🧹 Nettoyage</button>
        <button className={activeSection === "account" ? "active" : ""} onClick={() => setActiveSection("account")}>Mon Profil</button>
        <div className="sidebar-bottom">
          <div className="sidebar-logo">
            <img src={logo} alt="Logo" className="app-logo" />
          </div>
        </div>
      </aside>

      <main className="admin-content">
        <div className="admin-topbar">
          <div className="admin-topbar-left">
            <span className="admin-topbar-title"><span className="super-admin-badge">👑 SUPER ADMIN</span></span>
            <span className="admin-topbar-subtitle">DMT - Doumbia Moussa Transport</span>
            <div className="admin-topbar-stats">
              <span className="topbar-stat">👥 {users.length} utilisateur{users.length !== 1 ? 's' : ''}</span>
              <span className="topbar-stat">🏢 {services.length} service{services.length !== 1 ? 's' : ''}</span>
              <span className="topbar-stat">🟢 {users.filter(u => { const diff = u.last_seen ? Date.now() - new Date(u.last_seen).getTime() : Infinity; return diff < 600000; }).length} en ligne</span>
            </div>
          </div>
          <div className="admin-topbar-right">
            <div className="admin-topbar-clock">
              <span className="admin-topbar-date">{formatDate(currentTime)}</span>
              <span className="admin-topbar-time">{formatTime(currentTime)}</span>
            </div>
            <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === "dark" ? "Mode clair" : "Mode sombre"}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button onClick={handleLogout} className="topbar-logout-button">
              ⏻ Déconnexion
            </button>
            <button className="theme-toggle-btn" onClick={() => setHelpOpen(true)} title="Aide">
              ❓
            </button>
          </div>
        </div>
        <div className="welcome-banner">
          <span className="welcome-avatar">{userInfo?.username?.charAt(0).toUpperCase()}</span>
          <div className="welcome-text">
            <span className="welcome-label">Bienvenue,</span>
            <span className="welcome-name">{userInfo?.username}</span>
          </div>
        </div>

        {activeSection === "dashboard" && (
          <>
            <div className="section-header">
              <h2>Tableau de bord</h2>
              <span className="user-count-badge">Vue d'ensemble</span>
            </div>
            <div className="dashboard-grid">
              <div className="dashboard-card dashboard-card-users" onClick={() => setActiveSection("users")}>
                <div className="dashboard-card-icon">👥</div>
                <div className="dashboard-card-content">
                  <h3>Utilisateurs</h3>
                  <div className="dashboard-card-main">{dashboardStats?.users?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail online">🟢 {dashboardStats?.users?.online ?? 0} en ligne</span>
                    <span className="dash-detail inactive">🔴 {dashboardStats?.users?.inactive ?? 0} désactivés</span>
                    <span className="dash-detail inactive">⚫ {dashboardStats?.users?.never_connected ?? 0} jamais connectés</span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>

              <div className="dashboard-card dashboard-card-services" onClick={() => setActiveSection("createService")}>
                <div className="dashboard-card-icon">🏢</div>
                <div className="dashboard-card-content">
                  <h3>Services</h3>
                  <div className="dashboard-card-main">{dashboardStats?.services?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail online">✅ {dashboardStats?.services?.active ?? 0} actifs</span>
                    <span className="dash-detail inactive">⏸ {dashboardStats?.services?.inactive ?? 0} inactifs</span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>

              <div className="dashboard-card dashboard-card-files" onClick={() => setActiveSection("files")}>
                <div className="dashboard-card-icon">📁</div>
                <div className="dashboard-card-content">
                  <h3>Fichiers</h3>
                  <div className="dashboard-card-main">{dashboardStats?.files?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail">💾 {dashboardStats?.files?.size_mb ?? 0} MB utilisés</span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>

              <div className="dashboard-card dashboard-card-journal" onClick={() => { setActiveSection("submissions"); fetchHistorique(1, '', '', '', ''); }}>
                <div className="dashboard-card-icon">📋</div>
                <div className="dashboard-card-content">
                  <h3>Journal d'activité</h3>
                  <div className="dashboard-card-main">{dashboardStats?.journal?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail online">📅 {dashboardStats?.journal?.today ?? 0} aujourd'hui</span>
                    <span className="dash-detail" style={{fontSize:'0.75em', marginTop:'4px'}}>
                      Dernière : {dashboardStats?.journal?.last_user ?? '—'} - {dashboardStats?.journal?.last_date ?? '-'}
                    </span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>
              <div className="dashboard-card dashboard-card-disk">
                <div className="dashboard-card-icon">💽</div>
                <div className="dashboard-card-content">
                  <h3>Espace disque</h3>
                  <div className="dashboard-card-main">{dashboardStats?.disk?.used_pct ?? 0}%</div>
                  <div className="disk-progress-bar">
                    <div
                      className={`disk-progress-fill ${
                        (dashboardStats?.disk?.used_pct ?? 0) > 85 ? "disk-critical" :
                        (dashboardStats?.disk?.used_pct ?? 0) > 65 ? "disk-warning" : ""
                      }`}
                      style={{ width: `${dashboardStats?.disk?.used_pct ?? 0}%` }}
                    />
                  </div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail">
                      {dashboardStats?.disk?.used_gb ?? 0} GB / {dashboardStats?.disk?.total_gb ?? 0} GB
                    </span>
                    <span className="dash-detail" style={{fontSize:'0.75em', marginTop:'4px'}}>
                      {dashboardStats?.disk?.free_gb ?? 0} GB libres
                    </span>
                  </div>
                </div>
              </div>
              <div className="dashboard-card dashboard-card-folders" onClick={() => setActiveSection("files")}>
                <div className="dashboard-card-icon">🗂️</div>
                <div className="dashboard-card-content">
                  <h3>Dossiers</h3>
                  <div className="dashboard-card-main">{dashboardStats?.folders?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail online">🤝 {dashboardStats?.folders?.shared ?? 0} partagés</span>
                    <span className="dash-detail">🔒 {dashboardStats?.folders?.private ?? 0} privés</span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>
              <div className="dashboard-card dashboard-card-trash" onClick={() => { setActiveSection("trash"); fetchTrash(); }}>
                <div className="dashboard-card-icon">🗑️</div>
                <div className="dashboard-card-content">
                  <h3>Corbeille</h3>
                  <div className="dashboard-card-main">{dashboardStats?.trash?.total ?? 0}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail">📄 {dashboardStats?.trash?.fichiers ?? 0} fichiers · 📁 {dashboardStats?.trash?.dossiers ?? 0} dossiers</span>
                    <span className={`dash-detail${(dashboardStats?.trash?.total ?? 0) >= 10 ? " inactive" : ""}`}>
                      {(dashboardStats?.trash?.total ?? 0) >= 10 ? "⚠️ À vider" : "✅ OK"} · 💾 {dashboardStats?.trash?.size_mb ?? 0} MB
                    </span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>

              <div className="dashboard-card dashboard-card-roles" onClick={() => setActiveSection("users")}>
                <div className="dashboard-card-icon">🧩</div>
                <div className="dashboard-card-content">
                  <h3>Répartition rôles</h3>
                  <div className="roles-bars">
                    {[
                      { label: "Employés", value: dashboardStats?.roles?.employe ?? 0, color: "#3b82f6" },
                      { label: "Responsables", value: dashboardStats?.roles?.responsable ?? 0, color: "#0e9e87" },
                      { label: "Admins", value: dashboardStats?.roles?.admin ?? 0, color: "#f59e0b" },
                      { label: "Super Admin", value: dashboardStats?.roles?.super_admin ?? 0, color: "#a855f7" },
                    ].map((r) => {
                      const total = dashboardStats?.users?.total || 1;
                      const pct = Math.round((r.value / total) * 100);
                      return (
                        <div key={r.label} className="role-bar-row">
                          <span className="role-bar-label">{r.label}</span>
                          <div className="role-bar-track">
                            <div className="role-bar-fill" style={{ width: `${pct}%`, background: r.color }} />
                          </div>
                          <span className="role-bar-count">{r.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>
              <div className="dashboard-card dashboard-card-trend">
                <div className="dashboard-card-content" style={{width:'100%'}}>
                  <h3>📈 Tendance hebdomadaire — Uploads</h3>
                  <div className="trend-chart-wrapper">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={dashboardStats?.weekly_trend ?? []} margin={{top:8, right:8, left:-20, bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{fontSize:11}} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{fontSize:11}} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(value) => [value, "Uploads"]}
                          contentStyle={{fontSize:'0.8rem', borderRadius:'8px'}}
                        />
                        <Bar dataKey="uploads" fill="#6c63ff" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeSection === "users" && (
          <>
            <div className="section-header">
              <h2>Gestion des utilisateurs</h2>
              <span className="user-count-badge">
                {filteredUsers.length} / {users.length} utilisateur{users.length !== 1 ? 's' : ''}
              </span>
              <button className="btn-create-user" onClick={() => { setShowCreateModal(true); setFormError(''); setFormSuccess(''); setFormData({ username: '', email: '', password: '', confirmPassword: '', role: 'employe', service: '' }); }}>
                + Créer un utilisateur
              </button>
            </div>
            <div className="admin-filters-bar">
              <input
                className="admin-filter-input"
                placeholder="🔍 Rechercher par nom..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <select className="admin-filter-select" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                <option value="">Tous les rôles</option>
                <option value="super_admin">👑 Super Admin</option>
                <option value="employe">Employé</option>
                <option value="responsable">Responsable</option>
                <option value="admin">Admin</option>
              </select>
              <select className="admin-filter-select" value={filterService} onChange={(e) => setFilterService(e.target.value)}>
                <option value="">Tous les services</option>
                {[...new Set(users.map(u => u.service).filter(Boolean))].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select className="admin-filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Tous les statuts</option>
                <option value="online">🟢 En ligne</option>
                <option value="offline">🔴 Hors ligne</option>
                <option value="never">⚫ Jamais connecté</option>
                <option value="inactive">🚫 Désactivé</option>
              </select>
              <button className="admin-filter-reset" onClick={() => { setSearchTerm(''); setFilterRole(''); setFilterService(''); setFilterStatus(''); }}>
                ↺ Réinitialiser
              </button>
            </div>
            <div className="users-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Service</th>
                    <th>Email</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, index) => {
                      const { label: statusLabel, type: statusType } = getRelativeTime(u.last_seen, u.is_active);
                      return editingUser === u.id ? (
                        <tr key={u.id} className="editing-row">
                          <td data-label="#">{index + 1}</td>
                          <td data-label="Nom"><input value={editUserData.username} onChange={(e) => setEditUserData({ ...editUserData, username: e.target.value })} /></td>
                          <td data-label="Rôle">
                            <select value={u.role} onChange={(e) => handleUpdateRole(u.id, e.target.value)} disabled={u.id === userInfo?.id || u.role === 'super_admin'}>
                              <option value="super_admin">👑 Super Admin</option>
                              <option value="employe">Employé</option>
                              <option value="responsable">Responsable</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td data-label="Service">
                            <select value={editUserData.service} onChange={(e) => setEditUserData({ ...editUserData, service: e.target.value })}>
                              <option value="">— Aucun service —</option>
                              {services.map(s => (
                                <option key={s.id} value={s.nom}>{s.nom}</option>
                              ))}
                            </select>
                          </td>
                          <td data-label="Email"><input value={editUserData.email} onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })} /></td>
                          <td data-label="Statut"><span className={`status-badge ${statusType}`}>{statusLabel}</span></td>
                          <td data-label="Actions">
                            <button className="btn-save" onClick={() => handleEditSubmit(u.id)}>Sauvegarder</button>
                            <button className="btn-cancel" onClick={() => setEditingUser(null)}>Annuler</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={u.id} className={!u.is_active ? 'user-inactive' : ''}>
                          <td data-label="#">{index + 1}</td>
                          <td data-label="Nom">{u.username}</td>
                          <td data-label="Rôle">
                            <select value={u.role} onChange={(e) => handleUpdateRole(u.id, e.target.value)} disabled={u.id === userInfo?.id || u.role === 'super_admin'}>
                              <option value="super_admin">👑 Super Admin</option>
                              <option value="employe">Employé</option>
                              <option value="responsable">Responsable</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td data-label="Service">{u.service || '—'}</td>
                          <td data-label="Email">{u.email || '—'}</td>
                          <td data-label="Statut"><span className={`status-badge ${statusType}`}>{statusLabel}</span></td>
                          <td data-label="Actions" className={u.id === userInfo?.id ? 'actions-cell-solo' : ''}>
                            <button className="edit-user-button" onClick={() => handleEditStart(u)} disabled={!u.is_active} style={{opacity: !u.is_active ? 0.4 : 1, cursor: !u.is_active ? 'not-allowed' : 'pointer'}}>Éditer</button>
                            {u.id !== userInfo?.id && (
                              <>
                                <button
                                  className="reset-password-button"
                                  onClick={() => handleResetPassword(u.id, u.username)}
                                  disabled={resettingId === u.id || !u.is_active}
                                  style={{opacity: !u.is_active ? 0.4 : 1, cursor: !u.is_active ? 'not-allowed' : 'pointer'}}
                                >
                                  {resettingId === u.id ? '⏳ Réinitialisation...' : 'Réinitialiser Mdp'}
                                </button>
                                <button
                                  style={{
                                    padding:'4px 8px',
                                    fontSize:'0.78em',
                                    borderRadius:'5px',
                                    border:'none',
                                    cursor:'pointer',
                                    background: u.is_active ? '#fd7e14' : '#28a745',
                                    color:'white',
                                    marginLeft:'4px'
                                  }}
                                  onClick={() => handleToggleActive(u.id, u.is_active)}
                                  disabled={u.id === userInfo?.id}
                                  title={u.is_active ? 'Désactiver ce compte' : 'Réactiver ce compte'}
                                >
                                  {u.is_active ? '⏸ Désactiver' : '▶ Réactiver'}
                                </button>
                                {u.id !== userInfo?.id && (
                                  u.role !== 'super_admin' || userInfo?.is_superuser === true
                                ) && !u.is_superuser && (
                                  <button
                                    className="delete-user-button"
                                    onClick={() => setConfirmDeleteId(u.id)}
                                    title="Supprimer cet utilisateur"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: activeSection === "files" ? "block" : "none" }}>
          <AdminFileManager />
        </div>

        {activeSection === "submissions" && (
          <>
            <div className="section-header">
              <h2>Journal d'activité</h2>
              <span className="user-count-badge">{historiqueTotal} entrée{historiqueTotal !== 1 ? 's' : ''}</span>
            </div>

            {/* Onglets journal */}
            <div className="journal-tabs">
              <button
                className={`journal-tab${journalTab === "journal" ? " active" : ""}`}
                onClick={() => setJournalTab("journal")}
              >
                📋 Journal ({historiqueTotal})
              </button>
              <button
                className={`journal-tab${journalTab === "suppressions" ? " active" : ""}`}
                onClick={() => { setJournalTab("suppressions"); fetchAuditDeletions(); }}
              >
                🔍 Suppressions {auditDeletions.length > 0 && <span className="tab-badge-red">{auditDeletions.length}</span>}
              </button>
            </div>

            {journalTab === "journal" && (
              <>
            <div className="historique-filters">
              <input
                className="historique-search"
                placeholder="Rechercher par utilisateur..."
                value={historiqueSearch}
                onChange={(e) => { setHistoriqueSearch(e.target.value); fetchHistorique(1, historiqueAction, e.target.value); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
              />
              <select
                className="historique-select"
                value={historiqueAction}
                onChange={(e) => { setHistoriqueAction(e.target.value); fetchHistorique(1, e.target.value, historiqueSearch); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
              >
                <option value="">Toutes les actions</option>
                <option value="LOGIN">Connexion</option>
                <option value="UPDATE">Modification</option>
                <option value="DELETE">Suppression</option>
                <option value="CREATE">Création</option>
                <option value="UPLOAD">Upload</option>
                <option value="SHARE">Partage</option>
              </select>
              <input
                type="date"
                className="historique-date"
                value={dateDebut}
                onChange={(e) => { setDateDebut(e.target.value); fetchHistorique(1, historiqueAction, historiqueSearch, e.target.value, dateFin); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
                title="Date début"
              />
              <input
                type="date"
                className="historique-date"
                value={dateFin}
                onChange={(e) => { setDateFin(e.target.value); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, e.target.value); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
                title="Date fin"
              />
              <button className="btn-cancel" onClick={() => { setHistoriqueSearch(''); setHistoriqueAction(''); setDateDebut(''); setDateFin(''); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); fetchHistorique(1, '', '', '', ''); showToast('Filtres réinitialisés.', 'success'); }}>
                Réinitialiser
              </button>
              <button className="btn-cancel" style={{background:'#28a745', color:'white', border:'none', fontSize:'0.85em'}} onClick={handleExportCSV}>
                ⬇️ CSV
              </button>
              <button className="btn-danger" onClick={() => setConfirmClearAll(true)}>
                🗑️ Tout effacer
              </button>
            </div>
            <div className="users-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Utilisateur</th>
                    <th>Action</th>
                    <th>Objet</th>
                    <th>Date</th>
                    <th>Supprimer</th>
                  </tr>
                </thead>
                <tbody>
                  {historique.map((h, index) => (
                    <tr key={h.id}>
                      <td>{(historiquePage - 1) * 20 + index + 1}</td>
                      <td>{h.utilisateur}</td>
                      <td><span className={`action-badge action-${h.action.toLowerCase()}`}>{h.action_display}</span></td>
                      <td className="objet-cell">
                        <span
                          className="objet-text"
                          onMouseEnter={(e) => handleTooltipShow(e, h.objet)}
                          onMouseLeave={handleTooltipHide}
                        >
                          {h.objet}
                        </span>
                      </td>
                      <td>{h.date}</td>
                      <td>
                        {h.utilisateur !== userInfo?.username && (
                          <button className="delete-user-button" onClick={() => setConfirmDeleteHistoriqueId(h.id)}>Supprimer</button>
                        )}
                        {h.utilisateur === userInfo?.username && (
                          <span className="protected-log" title="Vous ne pouvez pas supprimer vos propres entrées">🔒</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-controls">
              <button className="btn-cancel" disabled={historiquePage === 1}
                onClick={() => { setHistoriquePage(1); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                ⏮ Première
              </button>
              <button className="btn-cancel" disabled={historiquePage === 1}
                onClick={() => { const p = historiquePage - 1; setHistoriquePage(p); fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                ← Précédent
              </button>
              <span className="pagination-info">Page {historiquePage} / {Math.ceil(historiqueTotal / 20) || 1}</span>
              <button className="btn-cancel" disabled={historiquePage * 20 >= historiqueTotal}
                onClick={() => { const p = historiquePage + 1; setHistoriquePage(p); fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                Suivant →
              </button>
              <button className="btn-cancel" disabled={historiquePage >= Math.ceil(historiqueTotal / 20)}
                onClick={() => { const p = Math.ceil(historiqueTotal / 20); setHistoriquePage(p); fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                Dernière ⏭
              </button>
              <div className="pagination-goto">
                <input
                  type="number"
                  min="1"
                  max={Math.ceil(historiqueTotal / 20)}
                  placeholder="Page..."
                  value={historiquePageInput}
                  onChange={(e) => setHistoriquePageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = Math.min(Math.max(1, parseInt(historiquePageInput) || 1), Math.ceil(historiqueTotal / 20));
                      setHistoriquePage(p);
                      setHistoriquePageInput('');
                      fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin);
                    }
                  }}
                />
                <button className="btn-primary" onClick={() => {
                  const p = Math.min(Math.max(1, parseInt(historiquePageInput) || 1), Math.ceil(historiqueTotal / 20));
                  setHistoriquePage(p);
                  setHistoriquePageInput('');
                  fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin);
                }}>Aller</button>
              </div>
            </div>

            {confirmDeleteHistoriqueId && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <h3>⚠️ Supprimer cette entrée ?</h3>
                  <p>Cette action est <strong>irréversible</strong>.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={() => { handleDeleteHistorique(confirmDeleteHistoriqueId); setConfirmDeleteHistoriqueId(null); }}>Supprimer</button>
                    <button className="btn-cancel" onClick={() => setConfirmDeleteHistoriqueId(null)}>Annuler</button>
                  </div>
                </div>
              </div>
            )}

            {confirmClearAll && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <h3>⚠️ Effacer tout le journal ?</h3>
                  <p>Cette action supprime <strong>toutes les {historiqueTotal} entrées</strong> de façon irréversible.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={handleClearAllHistorique}>Tout effacer</button>
                    <button className="btn-cancel" onClick={() => setConfirmClearAll(false)}>Annuler</button>
                  </div>
                </div>
              </div>
            )}
              </>
            )}

            {journalTab === "suppressions" && (
              <div className="audit-deletions-section">
                <div className="admin-filters-bar">
                  <input className="admin-filter-input" placeholder="🔍 Admin, utilisateur, objet..."
                    value={deletionSearch} onChange={e => setDeletionSearch(e.target.value)} />
                  <select className="admin-filter-select" value={deletionAction} onChange={e => setDeletionAction(e.target.value)}>
                    <option value="">Toutes les actions</option>
                    <option value="DELETE">Suppression</option>
                    <option value="LOGIN">Connexion</option>
                    <option value="CREATE">Création</option>
                    <option value="UPDATE">Modification</option>
                    <option value="UPLOAD">Upload</option>
                  </select>
                  <input type="date" className="admin-filter-input" value={deletionDateFrom}
                    onChange={e => setDeletionDateFrom(e.target.value)} title="Date début" />
                  <input type="date" className="admin-filter-input" value={deletionDateTo}
                    onChange={e => setDeletionDateTo(e.target.value)} title="Date fin" />
                  <button className="admin-filter-reset" onClick={() => {
                    setDeletionSearch(''); setDeletionAction(''); setDeletionDateFrom(''); setDeletionDateTo('');
                  }}>↺ Réinitialiser</button>
                  <button className="btn-cancel" style={{background:'#28a745', color:'white', border:'none', fontSize:'0.85em'}}
                    onClick={() => {
                      const headers = ["Admin","Log supprimé","Utilisateur","Action","Objet","Date","IP"];
                      const rows = filteredDeletions.map(d => [
                        d.admin, `#${d.deleted_log_id}`, d.deleted_utilisateur,
                        d.deleted_action, d.deleted_objet,
                        new Date(d.deleted_at).toLocaleString('fr-FR'), d.adresse_ip || ''
                      ]);
                      const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
                      const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url; link.download = 'suppressions_journal.csv';
                      link.click(); URL.revokeObjectURL(url);
                    }}>⬇️ CSV</button>
                </div>
                <div className="user-count-badge" style={{marginBottom:'8px'}}>
                  {filteredDeletions.length} suppression{filteredDeletions.length !== 1 ? 's' : ''}
                </div>
                {deletionsLoading ? (
                  <p>Chargement...</p>
                ) : auditDeletions.length === 0 ? (
                  <p className="no-data">Aucune suppression enregistrée.</p>
                ) : (
                  <div className="users-table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Admin</th>
                          <th>Log supprimé</th>
                          <th>Utilisateur concerné</th>
                          <th>Action supprimée</th>
                          <th>Objet</th>
                          <th>Date suppression</th>
                          <th>IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeletions.map((d, idx) => (
                          <tr key={d.id}>
                            <td>{idx + 1}</td>
                            <td><span className="badge-admin">👑 {d.admin}</span></td>
                            <td><span className="badge-log-id">#{d.deleted_log_id}</span></td>
                            <td>{d.deleted_utilisateur || "—"}</td>
                            <td><span className={`action-badge action-${d.deleted_action?.toLowerCase()}`}>{d.deleted_action}</span></td>
                            <td>{d.deleted_objet}</td>
                            <td>{new Date(d.deleted_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                            <td><code>{d.adresse_ip || "—"}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {auditDeletions.length > 0 && (
                  <div style={{display:"flex", justifyContent:"flex-end", marginTop:"12px"}}>
                    <button className="btn-danger" onClick={() => setConfirmClearDeletions(true)}>
                      🗑️ Nettoyer les suppressions
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeSection === "createService" && (
          <>
            <div className="section-header">
              <h2>Gestion des services</h2>
              <span className="user-count-badge">{services.length} service{services.length !== 1 ? 's' : ''}</span>
              <button className="btn-create-user" onClick={() => { setShowCreateServiceModal(true); setServiceFormError(''); }}>
                + Créer un service
              </button>
            </div>
            <div className="users-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nom du service</th>
                    <th>Description</th>
                    <th>Responsable</th>
                    <th>Employés</th>
                    <th>Statut</th>
                    <th>Créé le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, index) => (
                    <tr key={s.id}>
                      <td>{index + 1}</td>
                      <td><strong>{s.nom}</strong></td>
                      <td className="objet-cell">
                        <span className="objet-text"
                          onMouseEnter={(e) => handleTooltipShow(e, s.description || '—')}
                          onMouseLeave={handleTooltipHide}>
                          {s.description || '—'}
                        </span>
                      </td>
                      <td>{s.responsable}</td>
                      <td><span className="user-count-badge">{s.nb_employes}</span></td>
                      <td>
                        <span className={`status-badge ${s.statut === 'actif' ? 'online' : 'inactive'}`}>
                          {s.statut === 'actif' ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>{s.date_creation}</td>
                      <td>
                        <button className="edit-user-button" style={{marginRight:'5px'}} onClick={() => {
                          setEditServiceModal(s);
                          setEditServiceForm({ nom: s.nom, description: s.description || '', statut: s.statut, responsable_id: s.responsable_id || '' });
                          setEditServiceError('');
                        }}>Éditer</button>
                        <button className="delete-user-button" onClick={() => setConfirmDeleteServiceId(s.id)}>Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showCreateServiceModal && (
              <div className="modal-overlay">
                <div className="modal-box modal-box-large">
                  <h3>🏢 Créer un service</h3>
                  {serviceFormError && <div className="error-box"><p>{serviceFormError}</p></div>}
                  <form onSubmit={handleCreateService}>
                    <div className="form-group">
                      <label>Nom du service *</label>
                      <input value={serviceForm.nom} onChange={(e) => setServiceForm({...serviceForm, nom: e.target.value})} placeholder="ex: Service Informatique" />
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <textarea value={serviceForm.description} onChange={(e) => setServiceForm({...serviceForm, description: e.target.value})} placeholder="Rôle et mission du service..." rows={3} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #dde3ea', resize:'vertical'}} />
                    </div>
                    <div className="form-group">
                      <label>Responsable</label>
                      <select value={serviceForm.responsable_id} onChange={(e) => setServiceForm({...serviceForm, responsable_id: e.target.value})}>
                        <option value="">— Aucun responsable —</option>
                        {users.filter(u => u.role === 'responsable' || u.role === 'admin').map(u => (
                          <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Statut</label>
                      <select value={serviceForm.statut} onChange={(e) => setServiceForm({...serviceForm, statut: e.target.value})}>
                        <option value="actif">Actif</option>
                        <option value="inactif">Inactif</option>
                      </select>
                    </div>
                    <div className="modal-actions">
                      <button type="submit" className="btn-primary">Créer le service</button>
                      <button type="button" className="btn-cancel" onClick={() => setShowCreateServiceModal(false)}>Annuler</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDeleteServiceId && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <h3>⚠️ Supprimer ce service ?</h3>
                  <p>Les utilisateurs rattachés à ce service ne seront <strong>pas supprimés</strong> mais perdront leur service assigné.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={() => handleDeleteService(confirmDeleteServiceId)}>Supprimer</button>
                    <button className="btn-cancel" onClick={() => setConfirmDeleteServiceId(null)}>Annuler</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeSection === "register" && (
          <div className="register-section">
            <div className="section-header">
              <h2>Créer un utilisateur</h2>
            </div>
            {formError && <div className="error-box"><p>{formError}</p></div>}
            {formSuccess && <div className="success-box"><p>{formSuccess}</p></div>}
            <div className="register-form-card">
              <form onSubmit={handleFormSubmit}>
                <div className="form-group">
                  <label>Nom d'utilisateur *</label>
                  <input
                    name="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="ex: namisata.diomande"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="ex: namisata.diomande@dmt.ci"
                  />
                </div>
                <div className="form-group">
                  <label>Mot de passe *</label>
                  <div className="input-with-eye">
                    <input
                      type={formPasswordVisible ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Minimum 6 caractères"
                    />
                    <button type="button" className="eye-btn" onClick={() => setFormPasswordVisible(!formPasswordVisible)}>
                      {formPasswordVisible ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirmer le mot de passe *</label>
                  <div className="input-with-eye">
                    <input
                      type={formPasswordVisible ? "text" : "password"}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Répéter le mot de passe"
                    />
                  </div>
                  {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="field-error">Les mots de passe ne correspondent pas</p>
                  )}
                  {formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && (
                    <p className="field-success">✓ Les mots de passe correspondent</p>
                  )}
                </div>
                <div className="form-group">
                  <label>Rôle *</label>
                  <select name="role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                    <option value="super_admin">👑 Super Admin</option>
                    <option value="employe">Employé</option>
                    <option value="responsable">Responsable</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Service</label>
                  <select name="service" value={formData.service || ''} onChange={(e) => setFormData({ ...formData, service: e.target.value })}>
                    <option value="">— Aucun service —</option>
                    {services.map(s => (
                      <option key={s.id} value={s.nom}>{s.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="register-form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={formData.password !== formData.confirmPassword || !formData.username || !formData.password}
                  >
                    Créer l'utilisateur
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      setFormData({ username: '', email: '', password: '', confirmPassword: '', role: 'employe', service: '' });
                      setFormError('');
                      setFormSuccess('');
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeSection === "cleanup" && (
          <div className="trash-section">
            <div className="section-header">
              <h2>🧹 Nettoyage des dossiers</h2>
              <button className="btn-secondary" onClick={fetchCleanup}>↺ Actualiser</button>
              {selectedCleanupIds.length > 0 && (
                <button className="btn-danger" onClick={handleCleanupSelected}>
                  🗑️ Déplacer en corbeille ({selectedCleanupIds.length})
                </button>
              )}
            </div>
            {/* Filtres + Recherche */}
            <div className="admin-filters-bar" style={{marginBottom:'12px'}}>
              <input
                className="filter-input"
                placeholder="🔍 Rechercher par nom, propriétaire..."
                value={cleanupSearch}
                onChange={e => setCleanupSearch(e.target.value)}
              />
              <select
                className="filter-select"
                value={cleanupFilter}
                onChange={e => setCleanupFilter(e.target.value)}
              >
                <option value="all">Tous ({(cleanupData?.total_empty || 0) + (cleanupData?.total_abandoned || 0)})</option>
                <option value="empty">📭 Vides ({cleanupData?.total_empty || 0})</option>
                <option value="abandoned">💤 Abandonnés ({cleanupData?.total_abandoned || 0})</option>
              </select>
            </div>
            {cleanupLoading ? (
              <p>Chargement...</p>
            ) : !cleanupData ? (
              <p className="no-data">Cliquez sur Actualiser pour analyser.</p>
            ) : (() => {
              const items = cleanupFilter === 'empty'
                ? cleanupData.empty
                : cleanupFilter === 'abandoned'
                ? cleanupData.abandoned
                : [...cleanupData.empty, ...cleanupData.abandoned];
              return items.length === 0 ? (
                <p className="no-data">Aucun dossier à nettoyer.</p>
              ) : (
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>
                        <input type="checkbox"
                          onChange={() => {
                            if (selectedCleanupIds.length === items.length) setSelectedCleanupIds([]);
                            else setSelectedCleanupIds(items.map(i => i.id));
                          }}
                          checked={selectedCleanupIds.length === items.length && items.length > 0}
                        />
                      </th>
                      <th>Type</th>
                      <th>Nom</th>
                      <th>Propriétaire</th>
                      <th>Service</th>
                      <th>Créé le</th>
                      <th>Modifié le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .filter(item =>
                        !cleanupSearch ||
                        item.nom.toLowerCase().includes(cleanupSearch.toLowerCase()) ||
                        item.proprietaire.toLowerCase().includes(cleanupSearch.toLowerCase()) ||
                        item.service.toLowerCase().includes(cleanupSearch.toLowerCase())
                      )
                      .map((item, idx) => (
                      <tr key={item.id} className={selectedCleanupIds.includes(item.id) ? "row-selected" : ""}>
                        <td>
                          <input type="checkbox"
                            checked={selectedCleanupIds.includes(item.id)}
                            onChange={() => setSelectedCleanupIds(prev =>
                              prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]
                            )}
                          />
                        </td>
                        <td>
                          <span className={`action-badge ${
                            item.type === 'empty' ? 'action-delete' :
                            item.type === 'empty_parent' ? 'action-update' :
                            'action-login'
                          }`}>
                            {item.type === 'empty' ? '📭 Vide' :
                             item.type === 'empty_parent' ? '📂 Parent vide' :
                             '💤 Abandonné'}
                          </span>
                        </td>
                        <td>
                          {item.parent_nom
                            ? <span>　└ 📁 {item.nom} <span style={{fontSize:'0.72rem', color:'#9ca3af'}}>({item.parent_nom})</span></span>
                            : <span>📁 {item.nom}</span>
                          }
                        </td>
                        <td>{item.proprietaire}</td>
                        <td>{item.service}</td>
                        <td>{item.created_at}</td>
                        <td>{item.updated_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
            {confirmCleanup && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <div style={{textAlign:'center', marginBottom:'12px'}}>
                    <span style={{fontSize:'2rem'}}>🧹</span>
                  </div>
                  <h3 style={{textAlign:'center', marginBottom:'8px'}}>Déplacement en corbeille</h3>
                  <p style={{textAlign:'center', color:'#6b7280', fontSize:'0.85rem', marginBottom:'16px'}}>
                    {selectedCleanupIds.length} dossier{selectedCleanupIds.length > 1 ? 's' : ''} sera{selectedCleanupIds.length > 1 ? 'ont' : ''} déplacé{selectedCleanupIds.length > 1 ? 's' : ''} en corbeille.
                    <br/>Vous pourrez les restaurer depuis la section Corbeille.
                  </p>
                  <div className="modal-actions" style={{justifyContent:'center', gap:'12px'}}>
                    <button className="btn-cancel-confirm" onClick={() => setConfirmCleanup(false)}>
                      Annuler
                    </button>
                    <button className="btn-danger" onClick={handleCleanupConfirm}>
                      🗑️ Confirmer le déplacement
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === "trash" && (
          <div className="trash-section">
            <div className="section-header">
              <h2>🗑️ Corbeille ({trashItems.length} élément{trashItems.length > 1 ? 's' : ''})</h2>
              <button
                className="btn-danger"
                onClick={() => setEmptyTrashModal(true)}
                disabled={trashItems.length === 0}
              >
                {selectedTrashIds.length > 0
                  ? `🔥 Vider la sélection (${selectedTrashIds.length})`
                  : `🔥 Vider tout (${trashItems.length})`}
              </button>
              <button className="btn-secondary" onClick={fetchTrash}>↺ Actualiser</button>
              {selectedTrashIds.length > 0 && (
                <button className="btn-edit" onClick={() => setConfirmTrashAction({ type: 'restore_selected' })}>
                  ↩️ Restaurer la sélection ({selectedTrashIds.length})
                </button>
              )}
            </div>
            {/* Alerte volume */}
            {trashItems.length >= 10 && (
              <div className="trash-alert">
                ⚠️ La corbeille contient {trashItems.length} éléments. Pensez à la vider régulièrement.
              </div>
            )}
            {/* Filtres */}
            <div className="admin-filters-bar" style={{marginBottom:'12px'}}>
              <input
                placeholder="🔍 Rechercher par nom..."
                value={trashSearch || ''}
                onChange={e => { setTrashSearch(e.target.value); setTrashPage(1); }}
                className="filter-input"
              />
              <select
                value={trashTypeFilter || ''}
                onChange={e => { setTrashTypeFilter(e.target.value); setTrashPage(1); }}
                className="filter-select"
              >
                <option value="">Tous les types</option>
                <option value="file">📄 Fichiers</option>
                <option value="folder">📁 Dossiers</option>
              </select>
            </div>
            {trashLoading ? (
              <p>Chargement...</p>
            ) : trashItems.length === 0 ? (
              <p className="no-data">Corbeille vide.</p>
            ) : (() => {
              const filtered = trashItems
                .filter(i => !trashSearch || i.nom.toLowerCase().includes(trashSearch.toLowerCase()))
                .filter(i => !trashTypeFilter || i.item_type === trashTypeFilter);
              const totalPages = Math.ceil(filtered.length / TRASH_PAGE_SIZE);
              const paginated = filtered.slice((trashPage-1)*TRASH_PAGE_SIZE, trashPage*TRASH_PAGE_SIZE);
              return (
              <>
              <table className="users-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox"
                        onChange={() => toggleSelectAllTrash(paginated)}
                        checked={selectedTrashIds.length === paginated.length && paginated.length > 0}
                      />
                    </th>
                    <th>#</th>
                    <th>Type</th>
                    <th>Nom</th>
                    <th>Dossier</th>
                    <th>Supprimé par</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((item, idx) => (
                    <tr key={item.id} className={selectedTrashIds.includes(item.id) ? "row-selected" : ""}>
                      <td>
                        <input type="checkbox"
                          checked={selectedTrashIds.includes(item.id)}
                          onChange={() => toggleTrashSelect(item.id)}
                        />
                      </td>
                      <td>{idx + 1}</td>
                      <td>{item.item_type === 'file' ? '📄' : '📁'}</td>
                      <td>
                        <div>{item.nom}</div>
                        {item.parent_nom && (
                          <div
                            style={{fontSize:'0.75rem', color:'#9ca3af', marginTop:'2px'}}
                            title="La restauration de ce dossier restaurera aussi son parent"
                          >
                            📁 sous-dossier de : <strong>{item.parent_nom}</strong> ⚠️
                          </div>
                        )}
                      </td>
                      <td>{item.folder_nom || '—'}</td>
                      <td>{item.deleted_by}</td>
                      <td>{item.deleted_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination-controls">
                  <button onClick={() => setTrashPage(1)} disabled={trashPage === 1}>⏮ Première</button>
                  <button onClick={() => setTrashPage(p => Math.max(1, p-1))} disabled={trashPage === 1}>← Précédent</button>
                  <span>Page {trashPage} / {totalPages}</span>
                  <button onClick={() => setTrashPage(p => Math.min(totalPages, p+1))} disabled={trashPage === totalPages}>Suivant →</button>
                  <button onClick={() => setTrashPage(totalPages)} disabled={trashPage === totalPages}>Dernière ⏭</button>
                </div>
              )}
              </>
              );
            })()}
            {confirmTrashAction && (
              <div className="modal-overlay">
                <div className="modal-box">
                  {confirmTrashAction.type === 'restore_single' && (
                    <>
                      <h3>↩️ Restauration</h3>
                      <p>Restaurer <strong>{confirmTrashAction.item.nom}</strong> dans son dossier d'origine ?</p>
                      <div className="modal-actions">
                        <button className="btn-cancel-confirm" onClick={() => setConfirmTrashAction(null)}>Annuler</button>
                        <button className="btn-edit" onClick={() => handleRestoreTrash(confirmTrashAction.item.id, confirmTrashAction.item.item_type)}>Restaurer</button>
                      </div>
                    </>
                  )}
                  {confirmTrashAction.type === 'restore_selected' && (
                    <>
                      <h3>↩️ Restauration multiple</h3>
                      <p>Restaurer <strong>{selectedTrashIds.length} élément(s)</strong> sélectionné(s) ?</p>
                      <div className="modal-actions">
                        <button className="btn-cancel-confirm" onClick={() => setConfirmTrashAction(null)}>Annuler</button>
                        <button className="btn-edit" onClick={handleRestoreSelected}>Restaurer</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {emptyTrashModal && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
                    <h3>🔐 Confirmer le vidage</h3>
                    <button onClick={() => { setEmptyTrashModal(false); setTrashError(''); }} style={{background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer'}}>✕</button>
                  </div>
                  <p>{selectedTrashIds.length > 0
                    ? `Supprimer définitivement ${selectedTrashIds.length} élément(s) sélectionné(s) ?`
                    : `Vider toute la corbeille (${trashItems.length} élément(s)) définitivement ?`}
                  </p>
                  <p style={{color:'#ef4444', fontSize:'0.82rem', marginBottom:'12px'}}>⚠️ Cette action est irréversible. Entrez vos credentials pour confirmer.</p>
                  <input
                    type="email"
                    placeholder="Votre email"
                    value={trashEmail}
                    onChange={e => { setTrashEmail(e.target.value); setTrashError(''); }}
                    className="form-input"
                    style={{marginBottom:'8px', width:'100%'}}
                  />
                  <div style={{position:'relative', marginBottom:'8px'}}>
                    <input
                      type={showTrashPassword ? "text" : "password"}
                      placeholder="Votre mot de passe"
                      value={trashPassword}
                      onChange={e => { setTrashPassword(e.target.value); setTrashError(''); }}
                      className="form-input"
                      style={{width:'100%', paddingRight:'40px', boxSizing:'border-box'}}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTrashPassword(p => !p)}
                      style={{position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:'1rem'}}
                    >
                      {showTrashPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {trashError && (
                    <p style={{color:'#ef4444', fontSize:'0.82rem', marginBottom:'8px'}}>❌ {trashError}</p>
                  )}
                  <div className="modal-actions">
                    <button className="btn-cancel-confirm" onClick={() => { setEmptyTrashModal(false); setTrashError(''); }}>Annuler</button>
                    <button
                      className="btn-danger"
                      onClick={handleEmptyTrash}
                      disabled={!trashEmail || !trashPassword || trashEmptying}
                    >
                      {trashEmptying ? '⏳ Suppression en cours...' : '🔥 Confirmer la suppression'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === "account" && (
          <div className="account-section">
            <div className="section-header">
              <h2>Mon Compte</h2>
            </div>
            <div className="account-layout">
              <div className="account-profile-card">
                <div className="account-avatar-large">
                  {userInfo?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="account-profile-info">
                  <h3 className="account-username">{userInfo?.username}</h3>
                  <p className="account-email">{userInfo?.email || 'Aucun email renseigné'}</p>
                  <div className="account-badges">
                    <span className={`status-badge ${userInfo?.role === 'super_admin' ? 'online' : userInfo?.role === 'admin' ? 'online' : 'recent'}`}>
                      {userInfo?.role === 'super_admin' ? '👑 Super Admin' : userInfo?.role === 'admin' ? '👑 Admin' : userInfo?.role === 'responsable' ? '🎯 Responsable' : '👤 Employé'}
                    </span>
                    {userInfo?.service && (
                      <span className="status-badge today">🏢 {userInfo.service}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="account-form-card">
                <h4 className="account-form-title">🔐 Changer le mot de passe</h4>
                <button
                  className={showPasswordForm ? 'btn-cancel' : 'btn-primary'}
                  style={{marginBottom:'16px', width:'100%'}}
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                >
                  {showPasswordForm ? 'Annuler' : 'Modifier mon mot de passe'}
                </button>
                {showPasswordForm && (
                  <div className="account-password-form">
                    <div className="form-group">
                      <label>Ancien mot de passe</label>
                      <div className="input-with-eye">
                        <input
                          type={passwordVisible ? "text" : "password"}
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          placeholder="Votre mot de passe actuel"
                        />
                        <button type="button" className="eye-btn" onClick={handlePasswordVisibilityToggle}>
                          {passwordVisible ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Nouveau mot de passe</label>
                      <div className="input-with-eye">
                        <input
                          type={passwordVisible ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 6 caractères"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Confirmer le nouveau mot de passe</label>
                      <div className="input-with-eye">
                        <input
                          type={passwordVisible ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Répéter le nouveau mot de passe"
                        />
                      </div>
                      {newPassword && confirmPassword && newPassword !== confirmPassword && (
                        <p className="field-error">Les mots de passe ne correspondent pas</p>
                      )}
                      {newPassword && confirmPassword && newPassword === confirmPassword && (
                        <p className="field-success">✓ Les mots de passe correspondent</p>
                      )}
                    </div>
                    {Array.isArray(passwordError) && passwordError.length > 0 && (
                      <div className="error-box">
                        <ul>{passwordError.map((e, i) => <li key={i}>{e}</li>)}</ul>
                      </div>
                    )}
                    <button
                      className="btn-primary"
                      style={{width:'100%'}}
                      onClick={handlePasswordChange}
                      disabled={!oldPassword || !newPassword || newPassword !== confirmPassword}
                    >
                      ✓ Valider le changement
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {resetPasswordModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>🔑 Mot de passe réinitialisé</h3>
            <p>Utilisateur : <strong>{resetPasswordModal.username}</strong></p>
            <p>Nouveau mot de passe :</p>
            <div className="password-display">{resetPasswordModal.newPassword}</div>
            {resetPasswordModal.emailEnvoye
              ? <p className="modal-note success-note">Email envoyé à l'utilisateur.</p>
              : <p className="modal-note">⚠️ Email non envoyé — communiquez ce mot de passe manuellement.</p>
            }
            <button className="btn-primary" onClick={() => setResetPasswordModal(null)}>Fermer</button>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>⚠️ Confirmer la suppression</h3>
            <p>Cette action est <strong>irréversible</strong>. Supprimer cet utilisateur ?</p>
            <div className="modal-actions">
              <button className="btn-danger" onClick={() => handleDeleteUser(confirmDeleteId)}>Supprimer</button>
              <button className="btn-cancel" onClick={() => setConfirmDeleteId(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-large">
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px"}}>
              <h3 style={{margin:0}}>➕ Créer un utilisateur</h3>
              <button
                type="button"
                style={{background:"none", border:"none", fontSize:"1.2rem", cursor:"pointer", color:"#666", padding:"4px 8px", borderRadius:"6px"}}
                onClick={() => { setShowCreateModal(false); setFormError(''); setFormSuccess(''); }}
                title="Fermer"
              >
                ✖
              </button>
            </div>
            {formError && <div className="error-box"><p>{formError}</p></div>}
            {formSuccess && <div className="success-box"><p>{formSuccess}</p></div>}
            <form onSubmit={async (e) => { const success = await handleFormSubmit(e); if (success) setShowCreateModal(false); }}>
              <div className="form-group">
                <label>Nom d'utilisateur *</label>
                <input name="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="ex: namisata.diomande" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input name="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="ex: namisata.diomande@dmt.ci" />
              </div>
              <div className="form-group">
                <label>Mot de passe *</label>
                <div className="input-with-eye">
                  <input type={formPasswordVisible ? "text" : "password"} name="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Minimum 6 caractères" />
                  <button type="button" className="eye-btn" onClick={() => setFormPasswordVisible(!formPasswordVisible)}>
                    {formPasswordVisible ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirmer le mot de passe *</label>
                <input type={formPasswordVisible ? "text" : "password"} name="confirmPassword" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} placeholder="Répéter le mot de passe" />
                {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="field-error">Les mots de passe ne correspondent pas</p>
                )}
                {formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && (
                  <p className="field-success">✓ Les mots de passe correspondent</p>
                )}
              </div>
              <div className="form-group">
                <label>Rôle *</label>
                <select name="role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <option value="super_admin">👑 Super Admin</option>
                  <option value="employe">Employé</option>
                  <option value="responsable">Responsable</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label>Service</label>
                <select name="service" value={formData.service || ''} onChange={(e) => setFormData({ ...formData, service: e.target.value })}>
                  <option value="">— Aucun service —</option>
                  {services.map(s => (
                    <option key={s.id} value={s.nom}>{s.nom}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary" disabled={formData.password !== formData.confirmPassword || !formData.username || !formData.password}>
                  Créer l'utilisateur
                </button>
                <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✅' : '❌'}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      {editServiceModal && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-large">
            <h3>✏️ Modifier le service</h3>
            {editServiceError && <div className="error-box"><p>{editServiceError}</p></div>}
            <form onSubmit={handleUpdateService}>
              <div className="form-group">
                <label>Nom du service *</label>
                <input value={editServiceForm.nom} onChange={(e) => setEditServiceForm({...editServiceForm, nom: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={editServiceForm.description} onChange={(e) => setEditServiceForm({...editServiceForm, description: e.target.value})} rows={3} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #dde3ea', resize:'vertical'}} />
              </div>
              <div className="form-group">
                <label>Responsable</label>
                <select value={editServiceForm.responsable_id} onChange={(e) => setEditServiceForm({...editServiceForm, responsable_id: e.target.value})}>
                  <option value="">— Aucun responsable —</option>
                  {users.filter(u => u.role === 'responsable' || u.role === 'admin').map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select value={editServiceForm.statut} onChange={(e) => setEditServiceForm({...editServiceForm, statut: e.target.value})}>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Sauvegarder</button>
                <button type="button" className="btn-cancel" onClick={() => setEditServiceModal(null)}>Annuler</button>
              </div>
            </form>
          </div>
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
      {confirmClearDeletions && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>🗑️ Nettoyer toutes les suppressions ?</h3>
            <p>Cette action est irréversible.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmClearDeletions(false)}>Annuler</button>
              <button className="btn-danger" onClick={handleClearDeletions}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && <HelpModalAdmin onClose={() => setHelpOpen(false)} />}

      {showLogoutWarning && (
        <div className="auto-logout-warning">
          ⚠️ Votre session expire dans 2 minutes. Cliquez n'importe où pour rester connecté.
          <button onClick={() => setShowLogoutWarning(false)}>✖</button>
        </div>
      )}
    </div>
  );
}

export default SuperAdminPanel;
