#!/bin/bash
# Backup DMT — PostgreSQL + Media
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/home/osboxes/backups/dmt"
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
pg_dump -U osboxes centralisation_db > $BACKUP_DIR/db_$DATE.sql

# Backup Media
tar -czf $BACKUP_DIR/media_$DATE.tar.gz /home/osboxes/centralisation_donnees/media/

# Garder uniquement les 4 derniers backups (28 jours)
ls -t $BACKUP_DIR/db_*.sql | tail -n +5 | xargs rm -f
ls -t $BACKUP_DIR/media_*.tar.gz | tail -n +5 | xargs rm -f

echo "[$DATE] Backup terminé." >> /home/osboxes/backups/backup.log
