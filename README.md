# DocFlow Pro — Système de Gestion Documentaire Enterprise

> API REST de centralisation des données opérationnelles · Django · PostgreSQL · React · RBAC · Audit complet · Sécurité avancée

Projet réalisé dans le cadre d'un **PFE & CDD** chez Doumbia Moussa Transport (DMT) · Abidjan · Novembre 2023 - Avril 2026.

---

## Contexte

Doumbia Moussa Transport exploitait des données opérationnelles dispersées sur **17 postes de travail distincts**, sans source unique de vérité. L'objectif : concevoir et déployer une plateforme documentaire centralisée, sécurisée et traçable, accessible selon le rôle de chaque collaborateur.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Clients (17 postes)                │
│         navigateurs / applications internes     │
└───────────────────┬─────────────────────────────┘
                    │ HTTP/HTTPS
┌───────────────────▼─────────────────────────────┐
│               Nginx (reverse proxy)             │
│         Routage · Fichiers statiques            │
└──────────┬────────────────────┬─────────────────┘
           │ api                │ 
┌──────────▼──────────┐ ┌───────▼─────────────────┐
│  Django REST API    │ │    React 18 (frontend)  │
│  RBAC · Auth · DRF  │ │    Node.js 20           │
└──────────┬──────────┘ └─────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│              PostgreSQL 16                      │
│          Base de données centralisée            │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│              Redis 7                            │
│       Cache · Rate limiting                     │
└─────────────────────────────────────────────────┘
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Serveur web | Nginx (reverse proxy) |
| Serveur d'application | Gunicorn 26.0.0 (3 workers × 4 threads gthread, unix socket) |
| Langage | Python 3.12 |
| Framework backend | Django 5.1.2 · Django REST Framework 3.15.2 |
| Base de données | PostgreSQL 16 |
| Cache & Rate limiting | Redis 7 · django-ratelimit |
| Authentification | Token Auth · RBAC |
| Frontend | React 18.3.1 · Node.js 20 |
| Notifications | Email SMTP Gmail · Polling temps réel |
| Tâches planifiées | django-cron · crontab système |
| Versioning | Git / GitHub |
| Environnement | Ubuntu 24.04 · Python venv |
| Conteneurisation | Docker 29.6 · Docker Compose v5.3 |
| Déploiement cible | AWS EC2 / GCP (v2.0.0+) |

---

## Workflow de déploiement

```bash
# 1. Modifier le code (Mac — Claude Code)
# 2. Vérification syntaxe/structure
node /tmp/checkN.js

# 3. Commit + push (Mac iTerm2)
git add ... && git commit -m "..." && git push origin main

# 4. VM — pull + tests unitaires
git pull
test-api          # alias → python manage.py test api --verbosity=2

# 5. Si tous les tests passent → déployer
docker-deploy-all

# Si FAIL → corriger avant de déployer (jamais déployer avec des tests qui échouent)
```

> **Règle stricte** : aucun déploiement sans `test-api` vert au préalable sur les modifications backend.

---

## Fonctionnalités par rôle

### Employé
- Gestion de dossiers personnels (créer, renommer, supprimer, sous-dossiers)
- Upload de fichiers (PDF, Word, Excel, CSV, images, vidéos, audio)
- Partage de dossiers avec permissions granulaires (lecture, écriture, modification, suppression)
- Archives avec expiration automatique (nettoyage cron à 2h00)
- Historique des fichiers partagés (pagination serveur, filtres, export CSV)
- Aperçu inline des fichiers (docx, xlsx, images, PDF)
- Notifications temps réel
- Mode sombre · Responsive
- Statistiques personnelles : dossiers, fichiers uploadés, partages, top dossiers, activité 30j

### Responsable
- Toutes les fonctionnalités Employé
- Identité visuelle dédiée (palette teal, badge service)
- Vue consolidée des dossiers de son service (lecture seule par défaut)
- Héritage automatique des permissions sur les sous-dossiers
- Partage de dossiers du service avec n'importe quel collaborateur
- ShareModal intelligent : groupement par service, propriétaire mis en avant, filtres multicritères
- Section dédiée aux dossiers reçus en partage hors service
- Quitter un dossier partagé sans affecter le propriétaire
- Migration automatique des dossiers récents lors d'un changement de service
- Stats service : 2 onglets — Mon service (membres, dossiers, fichiers, activité) + Mes stats
- Breadcrumb hiérarchique cliquable dans la navigation de fichiers

### Administrateur
- Gestion complète des utilisateurs (créer, éditer, désactiver, supprimer)
- Filtres avancés par rôle, service et statut de connexion
- Gestion des services CRUD
- Journal d'activité complet avec filtres et export CSV
- Onglet Suppressions — traçabilité immuable des suppressions de journal
- Notifications email automatiques aux autres admins lors de suppressions
- Réinitialisation de mots de passe
- Email de bienvenue avec coordonnées à la création de compte
- Tableau de bord stats : utilisateurs, services, fichiers, dossiers, espace disque, répartition rôles, tendance uploads, corbeille
- Corbeille : restauration ou suppression définitive des fichiers/dossiers supprimés avec credentials
- Vidage corbeille avec confirmation email + mot de passe et notification tous les admins
- Alerte automatique si corbeille ≥ 10 éléments
- Backup automatique PostgreSQL + media tous les 7 jours
- Section Archives : voir, restaurer ou supprimer définitivement tous les dossiers archivés
- Section Nettoyage : identifier et supprimer les dossiers vides ou abandonnés (60 jours)
- Sidebar navigation par groupes repliables (Gestion / Fichiers / Zone danger)
- Mon Compte : date d'inscription, vraie dernière connexion (previous_login), session active en cours
- Aperçu inline vidéo/audio via lecteur Plyr CDN · Téléchargement et impression depuis FileManager

### Super Administrateur
- Toutes les fonctionnalités Administrateur
- Visibilité sur l'ensemble des utilisateurs y compris les admins
- Création et suppression de comptes administrateurs
- Modification de tous les rôles sans restriction
- Nettoyage de l'historique des suppressions
- Isolation totale — actions invisibles des admins normaux
- Compte `is_superuser` immuable, non modifiable par les admins
- Dashboard et corbeille synchronisés avec AdminPanel
- Corbeille comptes supprimés : restaurer ou supprimer définitivement les comptes soft-deletés
- Audit sécurité complet (6 tests de pénétration validés avant migration cloud)

---

## Sécurité

| Mécanisme | Description |
|---|---|
| RBAC | 4 rôles : `super_admin`, `admin`, `responsable`, `employe` |
| Rate limiting | 5 tentatives / 10 min sur le login (via Redis) |
| Tests de pénétration | 6/6 validés : auth bypass, IDOR, upload malveillant, brute force, SQL injection, escalade privilèges |
| previous_login | Historique connexion réelle (distincte de la session en cours) |
| AuditLog | Traçabilité complète de toutes les actions utilisateurs |
| AuditLogDeletion | Traçabilité des suppressions du journal d'activité |
| Email d'alerte | Notification automatique aux admins lors de suppressions |
| Protection souveraine | Compte `is_superuser` non modifiable via l'interface |
| Permissions granulaires | Par dossier : lecture, écriture, modification, suppression |

---

## Installation

### Prérequis

- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis 7
- Nginx
- Git

### Étapes

```bash
# 1. Cloner le dépôt
git clone git@github.com:Meadohm/DMT_Project.git
cd DMT_Project

# 2. Environnement virtuel Python
python3 -m venv venv
source venv/bin/activate

# 3. Dépendances Python
pip install -r requirements.txt

# 4. Dépendances frontend
cd frontend && npm install && cd ..

# 5. Variables d'environnement
cp .env.example .env
# Éditer .env avec vos credentials

# 6. Base de données
python manage.py migrate

# 7. Créer le super administrateur
python manage.py shell -c "
from api.models import Utilisateur
u = Utilisateur.objects.create_superuser(
    username='ADMIN',
    email='admin@test.com',
    password='mon_mot_de_passe'
)
u.role = 'super_admin'
u.save()
"

# 8. Lancer Redis
sudo systemctl start redis-server

# 9. Lancer le backend
python manage.py runserver

# 10. Lancer le frontend
cd frontend && npm start
```

---

## Variables d'environnement

```env
SECRET_KEY=votre_secret_key_django
DEBUG=True
DB_NAME=dmt_db
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
DB_HOST=localhost
DB_PORT=5432
ALLOWED_HOSTS=localhost,127.0.0.1
EMAIL_HOST_USER=votre_email@gmail.com
EMAIL_HOST_PASSWORD=votre_app_password_gmail
```

---

## Structure du projet

```
DMT_Project
├── api                         # Application principale
│   ├── models.py               # Utilisateur, Folder, File, AuditLog, Archive...
│   ├── views.py                # 50+ endpoints REST
│   ├── serializers.py
│   ├── urls.py
│   ├── permissions.py          # IsCustomAdminUser, IsSuperAdmin
│   └── migrations
├── centralisation_donnees      # Configuration Django
│   ├── settings.py
│   └── urls.py
├── frontend                    # Application React 18
│   ├── src 
│   │   ├── pages               # Login, Dashboard, AdminPanel, SuperAdminPanel...
│   │   ├── components          # FileManager, ShareModal, DashboardTopbar...
│   │   ├── services            # authService, folderService, adminService...
│   │   └── styles 
│   └── public
├── .env                        # Variables d'environnement (non versionné)
├── requirements.txt
└── manage.py
```

---

## Versions

**v2.0.0 — Juillet 2026**
Dockerisation complète (5 services : dmt-backend, dmt-frontend, dmt-db, dmt-redis, nginx) · Gunicorn TCP 0.0.0.0:8000 (remplace Unix socket) · Build React multi-stage (node:18-alpine → nginx:alpine) · `docker-entrypoint.sh` (wait DB + migrate + collectstatic + gunicorn) · `STATIC_URL=/django-static/` pour éviter conflit avec chunks React · Resolver DNS Docker 127.0.0.11 · Settings dynamiques (DEBUG, ALLOWED_HOSTS, CORS, REDIS_URL depuis env) · `.env.docker` séparé du `.env` système · Aliases Docker VM (docker-deploy-all, docker-deploy-front, docker-deploy-back, docker-status, docker-logs-back, docker-stop-all) · Import données réelles via pg_dump → psql Docker · Tag v2.0.0 GitHub

**v1.5.5 — Juillet 2026**
Stack production Nginx+Gunicorn (remplace runserver+dmt-frontend) · Soft delete utilisateurs (restauration/suppression définitive SuperAdmin) · Archives admin multi-sélection avec notifications propriétaires · Sidebar Admin/SuperAdmin groupes repliables (Gestion, Fichiers, Zone danger) · Contraste/espacement/mode réduit sidebar · `previous_login` (migration 0024) — vraie dernière connexion distincte de la session en cours · Suivi session active "Connecté depuis X min" dans bandeau BIENVENUE · Carte Mon Compte enrichie (date inscription, dernière connexion, temps relatif) · Dropdown compte Employé/Responsable enrichi · `formatRelativeTime` centralisé dans `utils/timeUtils.js` · Lecteur vidéo/audio Plyr CDN · Téléchargement + impression fichiers FileManager · Fix sous-dossiers appartenant à d'autres dans les dossiers utilisateurs · Stats partages hérités sans doublons · Colonne Service dans corbeille · Audit sécurité 6 tests validés (bypass auth, IDOR, upload malveillant, brute force, injection SQL, escalade privilèges) · Aliases deploy VM (deploy-front, deploy-back, deploy-all)

**v1.5.2 — Juillet 2026**
Stats service responsable (membres en ligne, absents, dossiers, fichiers, activité équipe) · Stats personnelles employé (quota, top dossiers récursif, activité 30j) · Heartbeat last-seen tous dashboards · Corbeille admin complète

**v1.5.0 — Juillet 2026**
Corbeille admin complète (soft delete dossiers, restauration instantanée, vidage avec credentials) · Cycle de vie fichier (original_name, FileRenameHistory, date upload immuable) · Recherche par historique noms · Backup automatique 7 jours · Multi-sélection suppression fichiers · Dashboard stats complet (disque, dossiers, rôles, tendance, corbeille) · HelpModalAdmin mis à jour

**v1.4.5 — Juillet 2026**
Responsive complet tablette/mobile (1024px, 768px, 480px) · Footer fix · Auto-logout par inactivité multi-navigateurs · Logout backend token invalidé · Centre d'aide HelpModal tous dashboards · Mode sombre AdminPanel/SuperAdminPanel complet · Déconnexion automatique sync multi-navigateurs

**v1.4.4 — Juillet 2026**
Fix layout FileManager hauteur contrainte · Suppression footer fixed obsolète · Padding dashboard corrigé

**v1.4.3 — Juillet 2026**
Centre aide DocFlow Pro (HelpModal employé/responsable/admin) · Auto-logout inactivité par rôle · Déconnexion multi-navigateurs via token backend · Mode sombre AdminPanel et SuperAdminPanel

**v1.4.2 — Juillet 2026**
Filtres et tri dans liste de fichiers · Recherche globale cross-dossiers · Déplacement fichier (propriétaire) · Notifications suppression/renommage fichier · Dashboard stats complet (disque, dossiers, rôles, tendance) · Fix upload vidéo 500MB · Fix polling activeFolder

**v1.4.1 — Juin 2026**
Correctifs mineurs DashboardResponsable · Alignement features Employé/Responsable · Fix permissions héritées sous-dossiers

**v1.4.0 — Juin 2026**
DashboardResponsable complet · Composants Topbar/Sidebar mutualisés · Héritage permissions récursif · Endpoint vue service · ShareModal repensé · Migration dossiers changement service · Fix CSRF cross-navigateur

**v1.3.0 — Juin 2026**
SuperAdminPanel isolé · AuditLogDeletion · Email automatique admins · Rate limiting Redis · Filtres utilisateurs · Email bienvenue · Refonte login DocFlow Pro

**v1.2.0 — Mai 2026**
Archives expiration automatique · Historique fichiers partagés · ShareModal deux zones · Quitter dossier partagé · Mode sombre · Sous-dossiers 2 niveaux

**v1.1.0 — Avril 2026**
AdminPanel 6 sections · Journal activité filtres CSV · Gestion services CRUD · Aperçu fichiers Office

**v1.0.0 — Mars 2026**
API REST Django + React · Auth RBAC 4 rôles · Gestion dossiers fichiers · Partage permissions · Notifications temps réel

---

## Roadmap

**Complété**
- v2.0.0 : Dockerisation complète — prêt pour déploiement cloud

**Phase suivante — Cloud (v2.1.0)**
- Déploiement AWS EC2 (t3.micro → t3.small selon charge)
- HTTPS via Let's Encrypt (Certbot)
- UFW port 5432 restreint à IP spécifique
- SECRET_KEY production (python secrets.token_hex)
- ALLOWED_HOSTS + CORS restreints au domaine cloud
- Évaluer token temporaire pour `view_file` (previews iframe sans auth)
- Configurer rclone → Google Drive (backup externe automatique après chaque backup.sh)
- Configurer IP fixe serveur + démarrage Docker automatique au boot

**Phase applicative — v2.2.0+**
- JWT refresh token (remplace Token Auth)
- DashboardResponsable : permissions fines par service
- ~~Tests unitaires Django~~ → **28 tests passent** (auth, propriétaire, responsable, partage, suppression, RBAC)
- Phase Analytics : statistiques suppressions (graphiques mensuels/hebdomadaires)
- Phase Chat : système de commentaires par dossier/fichier (WebSocket) — temps réel, mentions @utilisateur

**Phase Mobile — v3.0.0**
- Application mobile Android/iOS (React Native) — accès complet depuis smartphone
- Scanner intégré : numérisation directe via caméra + OCR automatique → upload dans DocFlow Pro
- Notifications push (upload, partage, commentaire reçu)
- Mode hors-ligne : consultation des derniers documents synchronisés

---

## Confidentialité

Les données opérationnelles réelles de DMT ne sont pas incluses dans ce dépôt. Seul le code source, les modèles et la documentation sont publics. Les fichiers `media`, `.env` sont exclus du versioning.

---

## Auteur

**Mohamed FOFANA** · Ingénieur Big Data & IA · MSc BIHAR ESTIA-CGE

moh.fofana21@gmail.com · [GitHub](https://github.com/Meadohm)