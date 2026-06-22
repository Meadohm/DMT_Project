# Changelog

## [v1.1.0] — 2026-06-22

### AdminPanel - Refonte complète

#### Tableau de bord

- Section d'accueil par défaut avec 4 cartes de stats cliquables
- Stats : utilisateurs (total / en ligne / désactivés / jamais connectés), services (actifs/inactifs), fichiers, journal
- Navigation directe vers chaque section au clic

#### Gestion des utilisateurs

- Badges de statut dynamiques (en ligne / récent / aujourd'hui / inactif)
- Heartbeat toutes les 30s + auto-refresh toutes les 5s
- Admin connecté toujours en première position
- Colonnes # et Nom sticky au scroll horizontal
- Modal création utilisateur (email, service dropdown, validation temps réel)
- Modal édition avec dropdown service
- Modal réinitialisation mot de passe avec affichage + statut email
- Self-protection : impossible de modifier/supprimer son propre compte
- Désactivation/réactivation de compte avec révocation automatique des partages
- Boutons d'action grisés pour comptes inactifs
- Message login différencié pour compte désactivé (403)

#### Gestion des services

- Tableau avec description, responsable, nb employés, statut, date+heure création
- Modal création et édition de service
- Modal suppression avec avertissement impact utilisateurs
- Auto-refresh services toutes les 5s

#### Espace de stockage (Gestion fichiers)

- Icônes par type de fichier, tooltip sur nom tronqué
- Stats : total fichiers, espace utilisé, espace libre, % disque, camembert
- Colonne Partage : indicateur 🔗 + nombre + tooltip destinataires
- Indicateur ⚠️ fichier orphelin (dossier supprimé)
- Aperçu : PDF (embed), images, XLSX/CSV (SheetJS), DOCX (mammoth.js)
- Téléchargement via fetch+blob (compatible cross-origin)
- Renommer avec mise à jour locale immédiate
- Tri par colonne (nom, date, taille, propriétaire, type)
- Avertissement suppression fichier partagé avec count destinataires
- URLs media corrigées (Nginx port 80, sans :8000)

#### Journal d'activité

- Pagination backend 20/page avec navigation Première/Dernière/Aller à
- Filtres : action, utilisateur, date début/fin
- Badges colorés par type d'action
- Tooltip React fixed position sur colonne Objet
- Export CSV avec filtres actifs + BOM UTF-8 (compatible Excel)
- Protection self-log (icône 🔒 sur ses propres entrées)
- Persistance page courante via localStorage

#### Mon Profil (ex Compte utilisateur)

- Carte profil avec avatar, username, email, badges rôle+service
- Formulaire changement mot de passe redesigné (œil toggle, validation temps réel)
- Toast après changement réussi

#### Global

- Sidebar collapsible avec logo DMT en bas
- Topbar : titre + stats (utilisateurs / services / en ligne) + horloge temps réel
- Persistance section active via localStorage (survit au refresh)
- Auto-logout sur 403/401
- Gmail SMTP via App Password (emails reset mot de passe)

### Corrections

- URLs media via Nginx port 80 (fix double-concat :8000)
- Pagination Journal : page ne se réinitialise plus au changement
- Smart quotes Python remplacées (apostrophes françaises dans views.py)
- prefetch_related path invalide sur centralized-files
- authService passe status HTTP et message d'erreur à Login.js

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
