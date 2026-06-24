from django.core.management.base import BaseCommand
from django.utils import timezone
from api.models import Archive, AuditLog, Utilisateur
import os, logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Supprime les archives expirées'

    def handle(self, *args, **kwargs):
        expired = Archive.objects.filter(
            expires_at__lt=timezone.now(),
            is_active=True
        ).select_related('owner')
        count = 0
        for archive in expired:
            try:
                folder_name = archive.folder_name
                owner = archive.owner
                if archive.file and os.path.exists(archive.file.path):
                    os.remove(archive.file.path)
                archive.delete()
                try:
                    utilisateur = Utilisateur.objects.get(username=owner.username)
                    AuditLog.objects.create(
                        utilisateur=utilisateur,
                        action='DELETE',
                        objet=f'Archive expirée auto-supprimée : {folder_name}',
                        details='Suppression automatique par cron job (expiration 7 jours)',
                    )
                except Utilisateur.DoesNotExist:
                    pass
                count += 1
            except Exception as e:
                logger.error(f'Erreur suppression archive {archive.id}: {e}')
        self.stdout.write(f'{count} archive(s) expirée(s) supprimée(s).')
        logger.info(f'[CRON] {count} archives expirées supprimées.')
