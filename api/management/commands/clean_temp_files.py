import os
import time
from django.core.management.base import BaseCommand
from django.conf import settings
import logging

logger = logging.getLogger('my_logger')

class Command(BaseCommand):
    help = 'Supprime les fichiers dans le dossier temp/ qui ont plus de 48 heures'

    def handle(self, *args, **kwargs):
        temp_dir = os.path.join(settings.BASE_DIR, 'temp')  # Chemin du répertoire temp
        now = time.time()  # Heure actuelle
        cutoff = now - (48 * 3600)  # Convertir 48 heures en secondes

        files_deleted = 0  # Compteur pour les fichiers supprimés

        if os.path.exists(temp_dir):
            for filename in os.listdir(temp_dir):
                file_path = os.path.join(temp_dir, filename)
                if os.path.isfile(file_path):
                    file_age = os.stat(file_path).st_mtime  # Obtenir la date de dernière modification
                    if file_age < cutoff:
                        try:
                            os.remove(file_path)
                            files_deleted += 1
                            self.stdout.write(f"Fichier supprimé : {file_path}")
                            logger.info(f"Fichier supprimé: {file_path}")
                        except Exception as e:
                            logger.error(f"Erreur lors de la suppression du fichier {file_path}: {str(e)}")

            # Si aucun fichier n'a été supprimé, afficher un message
            if files_deleted == 0:
                self.stdout.write("Aucun fichier vieux de plus de 48 heures à supprimer.")
                logger.info("Aucun fichier vieux de plus de 48 heures à supprimer.")
        else:
            self.stdout.write("Le répertoire temp/ n'existe pas.")
            logger.warning(f"Le répertoire {temp_dir} n'existe pas.")
