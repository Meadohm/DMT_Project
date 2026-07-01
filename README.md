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
- Breadcrumb hiérarchique cliquable dans la navigation de fichiers

### Administrateur
- Gestion complète des utilisateurs (créer, éditer, désactiver, supprimer)
- Filtres avancés par rôle, service et statut de connexion
- Gestion des services CRUD
- Journal d'activité complet avec filtres et export CSV
- Onglet Suppressions - traçabilité immuable des suppressions de journal
- Notifications email automatiques aux autres admins lors de suppressions
- Réinitialisation de mots de passe
- Email de bienvenue avec coordonnées à la création de compte
- Statistiques tableau de bord

### Super Administrateur
- Toutes les fonctionnalités Administrateur
- Visibilité sur l'ensemble des utilisateurs y compris les admins
- Création et suppression de comptes administrateurs
- Modification de tous les rôles sans restriction
- Nettoyage de l'historique des suppressions
- Isolation totale - actions invisibles des admins normaux
- Compte `is_superuser` immuable, non modifiable par les admins

---

## Sécurité

| Mécanisme | Description |
|---|---|
| RBAC | 4 rôles : `super_admin`, `admin`, `responsable`, `employe` |
| Rate limiting | 5 tentatives / 10 min sur le login (via Redis) |
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

**v1.4.2 — Juillet 2026**
Filtres et tri dans liste de fichiers · Recherche globale cross-dossiers · Déplacement fichier (propriétaire) · Notifications suppression/renommage fichier · Dashboard stats complet (disque, dossiers, rôles, tendance) · Fix upload vidéo 500MB · Fix polling activeFolder

**v1.4.0 — Juin 2026**
DashboardResponsable complet · Composants Topbar/Sidebar mutualisés entre rôles · Héritage de permissions récursif sur les sous-dossiers · Endpoint dédié vue service · ShareModal repensé (groupement, filtres, sélection groupée) · Migration automatique des dossiers lors d'un changement de service · Correctifs CSRF cross-navigateur

**v1.3.0 — Juin 2026**
SuperAdminPanel avec rôle isolé · AuditLogDeletion · Email automatique aux admins · Rate limiting Redis (5/10min) · Filtres avancés utilisateurs · Email de bienvenue · Refonte login DocFlow Pro · Décompte rate limit persistant

**v1.2.0 — Mai 2026**
Archives avec expiration automatique · Historique fichiers partagés · ShareModal deux zones · Quitter un dossier partagé · Mode sombre complet · Sous-dossiers (limite 2 niveaux)

**v1.1.0 — Avril 2026**
AdminPanel complet 6 sections · Journal d'activité filtres et CSV · Gestion services CRUD · Aperçu fichiers Office

**v1.0.0 — Mars 2026**
API REST Django + React · Authentification RBAC 4 rôles · Gestion dossiers et fichiers · Partage avec permissions granulaires · Notifications temps réel

---

## Confidentialité

Les données opérationnelles réelles de DMT ne sont pas incluses dans ce dépôt. Seul le code source, les modèles et la documentation sont publics. Les fichiers `media`, `.env` sont exclus du versioning.

---

## Auteur

**Mohamed FOFANA** · Ingénieur Big Data & IA · MSc BIHAR ESTIA-CGE

moh.fofana21@gmail.com · [GitHub](https://github.com/Meadohm)