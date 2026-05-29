from django_cron import CronJobBase, Schedule
from api.models import Service, Utilisateur

class SyncServicesCronJob(CronJobBase):
    RUN_EVERY_MINS = 60  # Exécute toutes les 60 minutes

    schedule = Schedule(run_every_mins=RUN_EVERY_MINS)
    code = 'api.sync_services_cron'  # Code unique pour identifier ce cron job

    def do(self):
        # Récupérer les services depuis les utilisateurs
        services_utilisateurs = Utilisateur.objects.values_list('service', flat=True).distinct()
        
        # Récupérer les services déjà enregistrés
        services_enregistres = Service.objects.values_list('nom', flat=True)
        
        # Identifier et ajouter les services manquants
        services_manquants = set(services_utilisateurs) - set(services_enregistres)
        for service_nom in services_manquants:
            if service_nom:
                Service.objects.create(nom=service_nom)
