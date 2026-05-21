# DMT — API de centralisation des données opérationnelles

> Projet réalisé dans le cadre de mon **Projet de Fin d'Études (PFE)** et **CDD** chez Doumbia Moussa Transport (DMT) · Abidjan · Novembre 2023 – Avril 2026.

## Contexte

Doumbia Moussa Transport exploitait des données opérationnelles dispersées sur **17 postes de travail distincts**, sans source unique de vérité. L'objectif de ce projet : concevoir et implémenter une **API de centralisation et traçabilité** consolidant ces données dans une base unique, accessible et sécurisée.

## Architecture

## ⚙️ Fonctionnalités clés

- ✅ Ingestion temps réel depuis 17 sources distribuées
- ✅ Mise à jour incrémentale avec gestion de la cohérence des données
- ✅ Système de traçabilité complet (logs d'audit, conformité)
- ✅ Contrôle d'accès basé sur les rôles (RBAC)
- ✅ Sécurisation des flux et des données en transit
- ✅ Réduction de la dispersion des données vers une source unique de vérité

## 🛠️ Stack technique

| Couche | Technologie |
|--------|-------------|
| Langage | Python 3.x |
| Framework | Django · Django REST Framework |
| Base de données | PostgreSQL |
| Authentification & accès | RBAC (Django auth) |
| Versioning | Git / GitHub |

## 🚀 Installation

git clone https://github.com/Meadohm/DMT_Project.git
cd DMT_Project

# Créer et activer l'environnement virtuel
python -m venv envir1
source envir1/bin/activate        # Mac/Linux
# envir1\Scripts\activate         # Windows

# Installer les dépendances
pip install -r requirements.txt

# Configurer la base de données PostgreSQL
# Créer une base 'dmt_db' sur ton instance PostgreSQL
# puis éditer les paramètres DATABASE dans settings.py

# Initialiser la base de données
python manage.py migrate

# Lancer le serveur
python manage.py runserver
# Accéder à : http://127.0.0.1:8000

```bash
git clone https://github.com/Meadohm/DMT_Project.git
cd DMT_Project

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env  # à éditer avec tes credentials PostgreSQL

python manage.py migrate
python manage.py runserver
```

## 🔒 Confidentialité

Les données opérationnelles réelles de DMT ne sont pas incluses dans ce dépôt. Seul le code source de l'API, les modèles de données et la documentation technique sont publics.

## 👤 Auteur

**Mohamed FOFANA** · Ingénieur Big Data & IA · MSc BIHAR ESTIA-CGE  
📧 moh.fofana21@gmail.com · [Profil GitHub](https://github.com/Meadohm)
