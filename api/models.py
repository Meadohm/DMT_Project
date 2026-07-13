from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.conf import settings
import os
import hashlib
import re   # indispensable pour upload_to_folder

# Utilisateur personnalisé
class Utilisateur(AbstractUser):
    ROLE_CHOICES = [
        ('super_admin', 'Super Administrateur'),
        ('admin', 'Administrateur'),
        ('responsable', 'Responsable de service'),
        ('employe', 'Employé'),
    ]
    role = models.CharField(max_length=225, choices=ROLE_CHOICES, default='employe')
    last_seen = models.DateTimeField(null=True, blank=True)
    previous_login = models.DateTimeField(null=True, blank=True)
    email = models.EmailField(blank=True, unique=False)
    service = models.CharField(max_length=255, null=True, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='deleted_users'
    )

    class Meta:
        app_label = 'api'

    def __str__(self):
        return self.username

# Nouveau modèle Folder
class Folder(models.Model):
    nom = models.CharField(max_length=255)
    original_name = models.CharField(max_length=255, blank=True, null=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(Utilisateur, on_delete=models.SET_NULL, null=True, blank=True, related_name='deleted_folders')
    proprietaire = models.ForeignKey(Utilisateur, on_delete=models.SET_NULL, null=True, blank=True, related_name="folders")
    service = models.CharField(max_length=255, blank=True, null=True)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=models.CASCADE
    )  # Permet la hiérarchie des sous-dossiers
    is_archived = models.BooleanField(default=False)
    is_shared = models.BooleanField(default=False)
    shared_with = models.ManyToManyField(
        Utilisateur,
        related_name="shared_folders",
        through="FolderShare",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.nom} ({self.proprietaire.username if self.proprietaire else '—'})"

# Nouveau modèle FolderShare
class FolderShare(models.Model):
    folder = models.ForeignKey("Folder", on_delete=models.CASCADE, related_name="shares")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="folder_shares")
    can_read = models.BooleanField(default=True)
    can_write = models.BooleanField(default=False)
    can_update = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    can_delete_folder = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("folder", "user")
        verbose_name = "Partage de dossier"
        verbose_name_plural = "Partages de dossier"

    def __str__(self):
        perms = []
        if self.can_read: perms.append("lecture")
        if self.can_write: perms.append("ajout")
        if self.can_update: perms.append("modif")
        if self.can_delete: perms.append("suppr fichiers")
        if self.can_delete_folder: perms.append("suppr dossier")
        return f"Partage {self.folder.nom} → {self.user.username} ({', '.join(perms) or 'aucun droit'})"

# Helper → chemin dynamique fichier
def upload_to_folder(instance, filename):
    """
    Stocke le fichier dans uploads/<id_nom>/<filename>
    """
    if instance.folder:
        folder_name = f"{instance.folder.id}_{re.sub(r'[^a-zA-Z0-9_-]', '_', instance.folder.nom)}"
    else:
        folder_name = "misc"
    return os.path.join("uploads", folder_name, filename)

# Modèle File
class File(models.Model):
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name="files", null=True, blank=True)
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.SET_NULL, null=True, blank=True, related_name="files")
    fichier = models.FileField(upload_to=upload_to_folder, null=True, blank=True)
    nom = models.CharField(max_length=255, default="")
    original_name = models.CharField(max_length=255, blank=True, null=True)
    taille = models.BigIntegerField(default=0)
    type_fichier = models.CharField(max_length=255, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    file_hash = models.CharField(max_length=64, null=True, blank=True)

    def __str__(self):
        return f"{self.nom} ({self.folder.nom if self.folder else 'Sans dossier'})"

    @property
    def extension(self):
        if self.fichier:
            return self.fichier.name.split('.')[-1].lower()
        return None

    def supprimer_fichier(self):
        if self.fichier and os.path.isfile(self.fichier.path):
            os.remove(self.fichier.path)

    def calculate_file_hash(self):
        if self.fichier and os.path.exists(self.fichier.path):
            hasher = hashlib.sha256()
            with open(self.fichier.path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        return None

class FileRenameHistory(models.Model):
    file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='rename_history')
    old_name = models.CharField(max_length=255)
    new_name = models.CharField(max_length=255)
    renamed_by = models.ForeignKey(Utilisateur, on_delete=models.SET_NULL, null=True)
    renamed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-renamed_at']

class Trash(models.Model):
    ITEM_TYPES = [('file', 'Fichier'), ('folder', 'Dossier')]
    item_type = models.CharField(max_length=10, choices=ITEM_TYPES)
    item_id = models.IntegerField()
    nom = models.CharField(max_length=255)
    original_name = models.CharField(max_length=255, blank=True, null=True)
    deleted_by = models.ForeignKey(Utilisateur, on_delete=models.SET_NULL, null=True, related_name='trash_items')
    deleted_at = models.DateTimeField(auto_now_add=True)
    folder_nom = models.CharField(max_length=255, blank=True, null=True)
    file_path = models.CharField(max_length=500, blank=True, null=True)
    size_bytes = models.BigIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-deleted_at']

# Service
class Service(models.Model):
    STATUT_CHOICES = [
        ('actif', 'Actif'),
        ('inactif', 'Inactif'),
    ]
    nom = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, null=True)
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='actif')
    responsable = models.ForeignKey(
        'Utilisateur', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='services_geres'
    )
    date_creation = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nom

# Notifications
class Notification(models.Model):
    NOTIF_TYPES = [
        ('share', 'Partage de dossier'),
        ('permission', 'Mise à jour de permissions'),
        ('upload', 'Nouveau fichier'),
        ('archive', 'Archive disponible'),
        ('info', 'Information générale'),
    ]
    user = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=100, choices=NOTIF_TYPES, default="info")
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} → {self.type} ({'lu' if self.is_read else 'non lu'})"

# Archivage
User = get_user_model()

class Archive(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="archives")
    folder_name = models.CharField(max_length=255)
    file = models.FileField(upload_to="archives/")
    size = models.BigIntegerField(default=0)  # taille en octets (stockée en base)
    created_at = models.DateTimeField(auto_now_add=True)
    # Optionnel : expire après X jours
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    type_archive = models.CharField(max_length=10, default="zip")

    class Meta:
        indexes = [models.Index(fields=["owner", "is_active"])]


    def __str__(self):
        return f"Archive {self.folder_name} de {self.owner.username}"

# Audit et traçabilité complète
class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('LOGIN', 'Connexion'),
        ('LOGOUT', 'Déconnexion'),
        ('CREATE', 'Création'),
        ('UPDATE', 'Modification'),
        ('DELETE', 'Suppression'),
        ('UPLOAD', 'Upload fichier'),
        ('DOWNLOAD', 'Téléchargement'),
    ]

    utilisateur = models.ForeignKey(
        'Utilisateur',
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    objet = models.CharField(max_length=255)
    details = models.TextField(blank=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Log d'audit"
        verbose_name_plural = "Logs d'audit"

    def __str__(self):
        return f"{self.timestamp} | {self.utilisateur} | {self.action} | {self.objet}"
# Traçabilité suppressions Journal
class AuditLogDeletion(models.Model):
    """Trace chaque suppression d'une entrée AuditLog — immuable"""
    admin = models.ForeignKey(
        'Utilisateur',
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_deletions'
    )
    deleted_log_id = models.IntegerField()
    deleted_utilisateur = models.CharField(max_length=150, blank=True)
    deleted_action = models.CharField(max_length=20, blank=True)
    deleted_objet = models.CharField(max_length=255, blank=True)
    deleted_at = models.DateTimeField(auto_now_add=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-deleted_at']
        verbose_name = "Suppression Journal"

    def __str__(self):
        return f"{self.deleted_at} | {self.admin} | supprimé log #{self.deleted_log_id}"
