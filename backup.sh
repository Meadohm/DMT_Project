#!/bin/bash
# Backup DMT — PostgreSQL Docker + Media Docker
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/home/osboxes/backups/dmt"
COMPOSE_DIR="/home/osboxes/centralisation_donnees"
mkdir -p $BACKUP_DIR

# Backup PostgreSQL — DB Docker
docker compose --env-file $COMPOSE_DIR/.env.docker \
  -f $COMPOSE_DIR/docker-compose.yml \
  exec -T dmt-db pg_dump -U osboxes centralisation_db \
  > $BACKUP_DIR/db_$DATE.sql

# Backup Media — Volume Docker
sudo tar -czf $BACKUP_DIR/media_$DATE.tar.gz \
  /var/lib/docker/volumes/centralisation_donnees_media_data/_data/

# Garder uniquement les 4 derniers backups (28 jours)
ls -t $BACKUP_DIR/db_*.sql | tail -n +5 | xargs rm -f
ls -t $BACKUP_DIR/media_*.tar.gz | tail -n +5 | xargs rm -f

echo "[$DATE] Backup Docker terminé." >> /home/osboxes/backups/backup.log
