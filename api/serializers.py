from rest_framework import serializers
from .models import File, Folder, Service, FolderShare, Utilisateur, Notification, Archive
from django.conf import settings
import os

# ==============================
# Utilisateur
# ==============================
class UtilisateurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Utilisateur
        fields = ['id', 'username', 'email', 'role', 'service', 'avatar']


# ==============================
# FolderShare (permissions fines)
# ==============================
class FolderShareSerializer(serializers.ModelSerializer):
    user = UtilisateurSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=Utilisateur.objects.all(),
        source="user",
        write_only=True
    )
    shared_at = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = FolderShare
        fields = [
            'id',
            'user',
            'user_id',
            'can_read',
            'can_write',
            'can_update',
            'can_delete',
            'can_delete_folder',
            'shared_at',
        ]


# ==============================
# Folder
# ==============================
class FolderSerializer(serializers.ModelSerializer):
    proprietaire = UtilisateurSerializer(read_only=True)
    shares = serializers.SerializerMethodField()
    parent = serializers.SerializerMethodField()  # 🔹 Ajout pour envoyer l’ID parent clair
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = [
            'id',
            'nom',
            'proprietaire',
            'service',
            'parent',           # 🔹 ajouté ici
            'is_shared',
            'is_archived',
            'shares',
            'created_at',
            'updated_at',
            'permissions',
        ]

    # --- parent ---
    def get_parent(self, obj):
        """Retourne l’ID du dossier parent (None si racine)"""
        return obj.parent.id if obj.parent else None

    # --- shares ---
    def get_shares(self, obj):
        """Liste les utilisateurs avec lesquels ce dossier est partagé"""
        shares = FolderShare.objects.filter(folder=obj)
        return [
            {
                "id": s.id,
                "user_id": s.user.id,
                "username": s.user.username,
                "can_read": s.can_read,
                "can_write": s.can_write,
                "can_update": s.can_update,
                "can_delete": s.can_delete,
                "can_delete_folder": s.can_delete_folder,
                "shared_at": s.created_at,
            }
            for s in shares
        ]

    # --- permissions ---
    def get_permissions(self, obj):
        """Retourne les droits de l'utilisateur courant sur ce dossier"""
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            return {}

        user = request.user
        if user == obj.proprietaire:
            return {
                "can_read": True,
                "can_write": True,
                "can_update": True,
                "can_delete": True,
                "can_delete_folder": True,
                "can_share": True,
            }

        share = FolderShare.objects.filter(folder=obj, user=user).first()
        if not share:
            # Héritage : chercher le share sur le dossier parent (récursif)
            parent = obj.parent
            while parent:
                parent_share = FolderShare.objects.filter(folder=parent, user=user).first()
                if parent_share:
                    return {
                        "can_read": parent_share.can_read,
                        "can_write": parent_share.can_write,
                        "can_update": parent_share.can_update,
                        "can_delete": parent_share.can_delete,
                        "can_delete_folder": parent_share.can_delete_folder,
                        "can_share": False,
                    }
                # Responsable peut lire les dossiers de son service
                if (hasattr(user, 'role')
                        and user.role == 'responsable'
                        and parent.service
                        and parent.service == user.service):
                    return {
                        "can_read": True,
                        "can_write": False,
                        "can_update": False,
                        "can_delete": False,
                        "can_delete_folder": False,
                        "can_share": False,
                    }
                parent = parent.parent
            # Responsable peut lire les dossiers racine de son service
            if (hasattr(user, 'role')
                    and user.role == 'responsable'
                    and obj.service
                    and obj.service == user.service):
                return {
                    "can_read": True,
                    "can_write": False,
                    "can_update": False,
                    "can_delete": False,
                    "can_delete_folder": False,
                    "can_share": False,
                }
            return {}

        return {
            "can_read": share.can_read,
            "can_write": share.can_write,
            "can_update": share.can_update,
            "can_delete": share.can_delete,
            "can_delete_folder": share.can_delete_folder,
            "can_share": False,
        }


# ==============================
# File
# ==============================
class FileSerializer(serializers.ModelSerializer):
    utilisateur = UtilisateurSerializer(read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = File
        fields = [
            'id',
            'nom',
            'fichier',
            'url',
            'folder',
            'utilisateur',
            'taille',
            'type_fichier',
            'extension',
            'updated_at',
        ]

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.fichier and request:
            return request.build_absolute_uri(obj.fichier.url)
        return None


# ==============================
# Service
# ==============================
class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ['id', 'nom']



# ==============================
# Mettre à jour les permissions
# ==============================
class SharePermissionUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FolderShare
        fields = [
            "can_read",
            "can_write",
            "can_update",
            "can_delete",
            "can_delete_folder",
        ]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'type', 'message', 'is_read', 'created_at']


# ==============================
# Archivage
# ==============================
class ArchiveSerializer(serializers.ModelSerializer):
    type_archive = serializers.SerializerMethodField()

    class Meta:
        model = Archive
        fields = [
            "id",
            "folder_name",
            "file",
            "size",            # ✅ Important : taille brute en octets
            "created_at",
            "expires_at",
            "is_active",
            "type_archive",
        ]

    def get_type_archive(self, obj):
        """Détecte automatiquement le type de fichier (zip / rar)."""
        if not obj.file:
            return "unknown"
        path = str(obj.file)
        if path.lower().endswith(".zip"):
            return "zip"
        elif path.lower().endswith(".rar"):
            return "rar"
        return "unknown"
