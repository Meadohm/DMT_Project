#!/bin/bash
# setup.sh — Configurer l'environnement DMT sur une nouvelle machine
# Usage : bash setup.sh
# Repo  : github.com/Meadohm/DMT_Project

set -e

COMPOSE_DIR="/home/osboxes/centralisation_donnees"
BACKUP_DIR="/home/osboxes/backups/dmt"
LOG_DIR="$COMPOSE_DIR/logs"
USER="osboxes"

echo "======================================"
echo "  DMT DocFlow Pro — Setup v2.0.0"
echo "======================================"

# 1. Docker au démarrage
echo "[1/6] Activation Docker au démarrage..."
sudo systemctl enable docker
sudo usermod -aG docker $USER

# 2. Sudo tar sans mot de passe (pour cron backup)
echo "[2/6] Configuration sudo tar sans mot de passe..."
echo "$USER ALL=(ALL) NOPASSWD: /bin/tar" | sudo tee /etc/sudoers.d/dmt-backup > /dev/null
sudo visudo -c -f /etc/sudoers.d/dmt-backup

# 3. Dossiers nécessaires
echo "[3/6] Création des dossiers..."
mkdir -p $BACKUP_DIR
mkdir -p $LOG_DIR

# 4. Cron backup (7 jours)
echo "[4/6] Configuration cron backup..."
CRON_JOB="0 2 */7 * * $COMPOSE_DIR/backup.sh"
( crontab -l 2>/dev/null | grep -v "backup.sh" ; echo "$CRON_JOB" ) | crontab -
echo "Cron configuré : $CRON_JOB"

# 5. Chmod backup.sh
echo "[5/6] Permissions backup.sh..."
chmod +x $COMPOSE_DIR/backup.sh

# 6. Vérification Docker
echo "[6/6] Vérification Docker..."
docker --version
docker compose version

echo ""
echo "======================================"
echo "  Setup terminé !"
echo "======================================"
echo ""
echo "Prochaines étapes :"
echo "  1. Créer .env.docker  : cp .env.docker.example .env.docker && nano .env.docker"
echo "  2. Lancer l'app       : docker compose --env-file .env.docker up -d"
echo "  3. Importer DB        : voir RUNBOOK_DMT4.docx section 6"
echo "  4. Configurer rclone  : rclone config (Google Drive / S3)"
echo "======================================"
