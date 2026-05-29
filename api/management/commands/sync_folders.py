import os
import re
from django.core.management.base import BaseCommand
from django.conf import settings
from api.models import Folder


class Command(BaseCommand):
    help = "Synchronise les dossiers physiques avec ceux enregistrés en base de données (Folder)."

    def handle(self, *args, **kwargs):
        base_path = os.path.join(settings.MEDIA_ROOT, "uploads")
        os.makedirs(base_path, exist_ok=True)

        created_count = 0
        already_count = 0

        for folder in Folder.objects.all():
            # Crée un nom sûr : ID + nom nettoyé
            safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", folder.nom)
            folder_path = os.path.join(base_path, f"{folder.id}_{safe_name}")

            if not os.path.exists(folder_path):
                os.makedirs(folder_path)
                self.stdout.write(self.style.SUCCESS(f"✅ Créé : {folder_path}"))
                created_count += 1
            else:
                self.stdout.write(self.style.WARNING(f"⚠️ Déjà existant : {folder_path}"))
                already_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n🎯 Synchronisation terminée : {created_count} dossiers créés, {already_count} déjà présents."
        ))
