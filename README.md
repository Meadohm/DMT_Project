# DMT — API de centralisation des données opérationnelles

> Projet réalisé dans le cadre de mon **Projet de Fin d'Études (PFE)** et **CDD** chez Doumbia Moussa Transport (DMT) · Abidjan · Novembre 2023 – Avril 2026.

---

## Contexte

Doumbia Moussa Transport exploitait des données opérationnelles dispersées sur **17 postes de travail distincts**, sans source unique de vérité. L'objectif de ce projet : concevoir et implémenter une **API REST de centralisation et de traçabilité** consolidant ces données dans une base unique, accessible et sécurisée.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Clients (17 postes)                │
│         navigateurs / applications internes     │
└───────────────────┬─────────────────────────────┘
                    │ HTTP/HTTPS
┌───────────────────▼─────────────────────────────┐
│             Django REST Framework               │
│         API REST · RBAC · Authentification      │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│                PostgreSQL                       │
│          Base de données centralisée            │
└─────────────────────────────────────────────────┘
```

---

## Fonctionnalités clés

- Centralisation des données depuis 17 sources distribuées
- Mise à jour incrémentale avec gestion de la cohérence des données
- Système de traçabilité complet (logs d'audit, conformité)
- Contrôle d'accès basé sur les rôles (RBAC)
- Sécurisation des flux et des données en transit
- Génération de rapports (PDF, Excel) via `reportlab` et `openpyxl`
- Tâches planifiées via `django-cron`
- Gestion des fichiers uploadés (pièces administratives, documents)

---

## Stack technique

| Couche | Technologie |
|---|---|
| Langage | Python 3.12 |
| Framework backend | Django 5.1.2 · Django REST Framework 3.15.2 |
| Base de données | PostgreSQL |
| Authentification & accès | RBAC (Django auth) |
| Frontend | HTML/CSS/JS (templates Django) |
| Génération de documents | ReportLab (PDF) · OpenPyXL (Excel) |
| Tâches planifiées | django-cron |
| Gestion des images | Pillow |
| Versioning | Git / GitHub |
| Environnement | Ubuntu 24.04 · Python venv |

---

## Installation

### Prérequis

- Python 3.12+
- PostgreSQL (instance locale ou distante)
- Git

### Étapes

```bash
# 1. Cloner le dépôt
git clone git@github.com:Meadohm/DMT_Project.git
cd DMT_Project

# 2. Créer et activer l'environnement virtuel
python3 -m venv venv
source venv/bin/activate        # Linux / Mac
# venv\Scripts\activate         # Windows

# 3. Installer les dépendances
pip install -r requirements.txt

# 4. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos credentials PostgreSQL et SECRET_KEY

# 5. Créer la base de données PostgreSQL
# createdb dmt_db  (ou via pgAdmin)

# 6. Initialiser la base de données
python manage.py migrate

# 7. Créer un superutilisateur (optionnel)
python manage.py createsuperuser

# 8. Lancer le serveur
python manage.py runserver
```

Accès : `http://127.0.0.1:8000`
Admin : `http://127.0.0.1:8000/admin`

---

## Variables d'environnement

Créer un fichier `.env` à la racine du projet (non versionné) :

```env
SECRET_KEY=votre_secret_key_django
DEBUG=True
DB_NAME=dmt_db
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
DB_HOST=localhost
DB_PORT=5432
ALLOWED_HOSTS=localhost,127.0.0.1
```

---

## Structure du projet

```
DMT_Project
├── api                    # App principale — modèles, vues, serializers
│   ├── models.py
│   ├── views.py
│   ├── serializers.py
│   ├── urls.py
│   └── migrations
├── centralisation_donnees # Configuration Django (settings, urls, wsgi)
├── frontend               # Assets frontend statiques
├── venv                   # Environnement virtuel (non versionné)
├── .env                   # Variables d'environnement (non versionné)
├── .gitignore
├── manage.py
└── requirements.txt
```

---

## Confidentialité

Les données opérationnelles réelles de DMT ne sont pas incluses dans ce dépôt. Seul le code source de l'API, les modèles de données et la documentation technique sont publics. Les fichiers `media`, `.env` et `db.sqlite3` sont exclus du versioning.

---

## Auteur

**Mohamed FOFANA** · Ingénieur Big Data & IA · MSc BIHAR ESTIA-CGE  
📧 moh.fofana21@gmail.com · [Profil GitHub](https://github.com/Meadohm)