# Changelog

## [v1.0.0] — 2026-06-19

### Ajouté
- Authentification par token (DRF TokenAuth)
- Gestion des utilisateurs avec rôles (admin / responsable / employé)
- Gestion des dossiers hiérarchiques avec permissions fines (read/write/update/delete)
- Partage de dossiers entre utilisateurs (FolderShare)
- Upload, prévisualisation et téléchargement de fichiers
- Archivage de dossiers en ZIP avec expiration
- Système de notifications (share, upload, archive, info)
- AuditLog : traçabilité complète des actions (LOGIN, LOGOUT, CREATE, UPDATE, DELETE, UPLOAD, DOWNLOAD)
- Management commands : sync_services, sync_folders, clean_temp_files
- Services systemd : dmt-backend, dmt-frontend
- Reverse proxy Nginx (port 80 → 8000 / 3000)

### Stack
- Backend : Django 5.1.2 · DRF · PostgreSQL 16
- Frontend : React 18.3.1 · Node.js 20
- Infra : Ubuntu 24.04 · Nginx · VirtualBox
