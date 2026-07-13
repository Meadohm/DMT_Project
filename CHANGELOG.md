# Changelog

## [v1.5.5] — 2026-07-13
### Infrastructure & Production
- Stack Nginx + Gunicorn (unix:/tmp/dmt.sock, 3 workers × 4 threads gthread, timeout 300s) — remplace runserver + dmt-frontend
- Aliases deploy VM : `deploy-front`, `deploy-back`, `deploy-all`, `stop-back`, `stop-nginx`, `stop-all`
- Build React statique servi par Nginx (dmt-frontend désactivé)
- `RATELIMIT_IP_META_KEY = 'HTTP_X_REAL_IP'` requis pour rate limiting derrière proxy Unix socket

### Sécurité
- Audit de pénétration 6/6 validés : contournement auth (401), IDOR (403/404), upload malveillant (400), brute force Redis (5 tentatives), injection SQL (ORM paramétré), escalade de privilèges (403)
- Rapport PDF sécurité généré et archivé

### Backend
- Migration 0021-0023 : soft delete `Utilisateur` (`is_deleted`, `deleted_at`, `deleted_by`)
- Migration 0024 : champ `previous_login` (DateTimeField) — sauvegarde `last_login` avant écrasement au login
- `login_view` : `user.previous_login = user.last_login` avant `user.last_login = timezone.now()`
- `get_user_view` : expose `previous_login`, `date_joined`, `last_login`
- Transfert dossiers lors suppression utilisateur (vers responsable unique du service ou admin supprimant)
- Fix sous-dossiers : `parent_id__in` pour inclure sous-dossiers d'autres dans dossiers propriétaire
- Stats partages hérités sans doublons (reçus/donnés)

### AdminPanel
- Section Archives admin : liste, restauration, suppression définitive, multi-sélection, notifications propriétaires
- Corbeille : colonne Service ajoutée
- Sidebar restructurée en groupes repliables : Gestion (Utilisateurs, Services), Fichiers (Gestion fichiers, Archives, Journal), Zone danger (Corbeille, Nettoyage)
- `.sidebar-group-title` : contraste blanc translucide, font-weight 800, séparateur, mode réduit masqué
- `.sidebar-group-items` : conteneur flex remplace Fragment React (espacement corrigé)
- Mon Compte : `previous_login` (vraie dernière connexion) + `date_joined` + temps relatif (`formatRelativeTime`)
- Bandeau BIENVENUE : "Connecté depuis X min" via `currentTime` existant

### SuperAdminPanel
- Section Comptes supprimés : restauration/suppression définitive, filtres rôle/service, notification responsable
- Uniformisation sidebar avec AdminPanel (mêmes corrections contraste/espacement/mode réduit)
- Mon Compte : identique Admin (previous_login, date_joined, session active)

### DashboardTopbar (Employé/Responsable)
- Dropdown Mon Compte enrichi : Membre depuis (`date_joined`) + Dernière connexion (`previous_login`) + temps relatif
- "Connecté depuis X min" dans bandeau BIENVENUE (interval 60s, `forceTick`)
- Import `formatRelativeTime` depuis `utils/timeUtils.js`

### Frontend — Utilitaires
- `utils/timeUtils.js` : `formatRelativeTime` centralisé (était dupliqué dans AdminPanel.js et SuperAdminPanel.js)
- `getRelativeTime` supprimé des pages, remplacé par import partagé

### FileManager
- Lecteur vidéo/audio Plyr via CDN (remplacement lecteur natif)
- Bouton téléchargement (⬇️) et impression (🖨️) — impression masquée pour vidéo/audio
- Optimisation upload : AbortController + fetch (remplace axios), toast avant fetchFiles, hash après save

### UI/UX
- Toast close button (X) sur toutes les notifications
- Scroll et sticky headers dans modaux de détail et tableaux stats
- HelpModal scindé en 4 fichiers : HelpModal.js, HelpModalResponsable.js, HelpModalAdmin.js, HelpModalSuperAdmin.js

---

## [v1.5.3] — 2026-07-08
### Infrastructure
- Migration complète vers Nginx + Gunicorn (décommissionnement dmt-frontend.service)
- Configuration `/etc/nginx/sites-enabled/dmt_projet` : client_max_body_size 5G, proxy timeouts 300s
- RUNBOOK_DMT3.docx mis à jour avec architecture Gunicorn complète

---

## [v1.5.2] — 2026-07-06
### DashboardResponsable
- Stats service : 2 onglets — Mon service (membres en ligne/absents, dossiers, fichiers, activité équipe) + Mes stats
- Stats personnelles employé : quota, top dossiers récursif, activité 30j
- Heartbeat `last_seen` sur tous les dashboards (interval 30s)

### Backend
- Endpoint stats service : membres en ligne/absents, dossiers, fichiers, activité
- `last_seen` heartbeat endpoint

---

## [v1.5.0] — 2026-07-04
### AdminPanel — Corbeille complète
- Soft delete dossiers/fichiers (is_deleted, deleted_at)
- Restauration instantanée depuis la corbeille
- Vidage corbeille avec confirmation email + mot de passe admin
- Alerte automatique si corbeille ≥ 10 éléments
- Notification tous les admins lors du vidage

### Fichiers
- `original_name`, `FileRenameHistory`, date upload immuable
- Recherche par historique noms de fichiers
- Multi-sélection suppression fichiers

### Dashboard
- Stats complètes : disque, dossiers, rôles, tendance uploads hebdomadaire, corbeille
- Backup automatique PostgreSQL + media tous les 7 jours (cron 2h)

---

## [v1.4.5] — 2026-07-02
### Responsive & UX
- Responsive complet tablette/mobile (1024px, 768px, 480px)
- Auto-logout par inactivité (useAutoLogout hook, useCallback stabilisé)
- Déconnexion multi-navigateurs : token backend invalidé + `localStorage 'logout_signal'` 100ms setTimeout
- Centre d'aide HelpModal tous dashboards
- Mode sombre AdminPanel/SuperAdminPanel complet

---

## [v1.4.4] — 2026-07-01
### Corrections
- Fix layout FileManager hauteur contrainte
- Suppression footer fixed obsolète
- Padding dashboard corrigé

---

## [v1.4.3] — 2026-06-30
### Fonctionnalités
- Centre aide DocFlow Pro (HelpModal employé/responsable/admin)
- Auto-logout inactivité par rôle
- Mode sombre AdminPanel et SuperAdminPanel

---

## [v1.4.2] — 2026-06-29
### Fonctionnalités
- Filtres et tri dans liste de fichiers
- Recherche globale cross-dossiers
- Déplacement fichier (propriétaire)
- Notifications suppression/renommage fichier
- Dashboard stats complet (disque, dossiers, rôles, tendance)
- Fix upload vidéo 500MB
- Fix polling activeFolder

---

## [v1.4.1] — 2026-06-27
### Corrections
- Correctifs mineurs DashboardResponsable
- Alignement features Employé/Responsable
- Fix permissions héritées sous-dossiers

---

## [v1.4.0] — 2026-06-26
### DashboardResponsable
- Dashboard complet : composants Topbar/Sidebar mutualisés
- Héritage permissions récursif sur sous-dossiers
- Endpoint vue service consolidée
- ShareModal repensé : groupement par service, filtres multicritères
- Migration dossiers automatique lors changement service
- Fix CSRF cross-navigateur
- Breadcrumb hiérarchique cliquable

---

## [v1.3.0] — 2026-06-25
### SuperAdminPanel
- Panel isolé : actions invisibles des admins normaux
- AuditLogDeletion : traçabilité immuable des suppressions journal
- Email automatique admins lors de suppressions
- Nettoyage historique suppressions

### Sécurité & UX
- Rate limiting Redis (5 tentatives / 10 min)
- Filtres avancés utilisateurs (rôle, service, statut)
- Email de bienvenue à la création de compte
- Refonte page login DocFlow Pro

---

## [v1.2.0] — 2026-06-24

### DashboardEmployé — Modernisation complète

#### UI/Layout

- Refonte topbar style AdminPanel (gradient #003366→#00509e, avatar, horloge live)
- Sidebar collapsible ◀/▶ vert/orange
- Logo DMT fixe en bas sidebar
- Footer centré définitif
- Barre de recherche intégrée topbar
- Bouton "+ Nouveau" compact sidebar

#### Fonctionnalités

- Modal mot de passe : eye toggle, match indicator
- Archives : 2 onglets (Créer / Mes archives), archivage multiple, tout effacer
- Cron job suppression archives expirées (2h00) + AuditLog
- Historique fichiers partagés : pagination, filtres, CSV, aperçu inline
- AllNotificationsModal : confirmation custom, badge non-lu
- Mode sombre : couverture complète

#### Corrections

- Footer z-index définitif
- Sous-dossiers : limite 2 niveaux
- Renommage/suppression sous-dossiers : récursif instantané
- FolderShare.can_* permissions vérifiées

### Backend

- Migration 0014 type_archive
- clean_expired_archives cron
- bulk_create_archive, delete_all_archives endpoints
- list_shared_files pagination + filtres
- Limite 2 niveaux create_subfolder

---

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
