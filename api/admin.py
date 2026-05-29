from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Utilisateur


# Classe pour personnaliser l'interface admin de l'utilisateur
class UtilisateurAdmin(UserAdmin):

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'email')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),

        # Ajouter le champ rôle et service ici
        ('Rôle et Service', {'fields': ('role', 'service')}),
    )

    # Afficher 'username', 'email', 'role' et 'service' dans la liste des utilisateurs
    list_display = ('username', 'email', 'role', 'service')

# Enregistrer le modèle Utilisateur avec cette configuration personnalisée
admin.site.register(Utilisateur, UtilisateurAdmin)
