from django.core.management.base import BaseCommand
from api.models import Service, Utilisateur

class Command(BaseCommand):
    help = "Synchronise les services des utilisateurs avec la table Service"

    def handle(self, *args, **kwargs):
        # Récupérer les services uniques depuis les utilisateurs
        services_utilisateurs = Utilisateur.objects.values_list('service', flat=True).distinct()
        
        # Récupérer les services déjà enregistrés
        services_enregistres = Service.objects.values_list('nom', flat=True)
        
        # Identifier les services manquants
        services_manquants = set(services_utilisateurs) - set(services_enregistres)
        
        # Ajouter les services manquants
        for service_nom in services_manquants:
            if service_nom:  # Vérifie que le service n'est pas vide
                Service.objects.create(nom=service_nom)
                self.stdout.write(self.style.SUCCESS(f"Service ajouté : {service_nom}"))
        
        if not services_manquants:
            self.stdout.write(self.style.SUCCESS("Aucun service manquant. Synchronisation complète !"))
