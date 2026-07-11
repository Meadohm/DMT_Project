import os, hashlib, shutil, logging, re, csv, zipfile, mimetypes
from django.db.models import Count
from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
import shutil
from django.core.mail import send_mail
from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited
from django.core.files import File as DjangoFile
from django.utils.crypto import get_random_string
from django.http import HttpResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from .permissions import IsCustomAdminUser, IsSuperAdmin
from .models import File as FileModel, Folder, Service, FolderShare, Utilisateur, Notification, Archive, AuditLog, AuditLogDeletion, FileRenameHistory, Trash
from .serializers import FileSerializer, FolderSerializer, ServiceSerializer, NotificationSerializer, ArchiveSerializer

logger = logging.getLogger(__name__)
Utilisateur = get_user_model()

# HELPER PERMISSIONS
def has_folder_permission(user, folder, action: str) -> bool:
    """ Vérifie si un utilisateur a les droits nécessaires sur un dossier via FolderShare """
    if user == folder.proprietaire:
        return True

    share = FolderShare.objects.filter(folder=folder, user=user).first()
    if not share:
        # Héritage : vérifier le dossier parent récursivement
        if folder.parent:
            return has_folder_permission(user, folder.parent, action)
        # Responsable peut lire les dossiers racine de son service
        if (action == "read"
                and hasattr(user, 'role')
                and user.role == 'responsable'
                and folder.service
                and folder.service == user.service):
            return True
        return False

    # Lecture autorisée par défaut si l'utilisateur a accès au partage
    if action == "read":
        return True

    if action == "write":
        return share.can_write
    if action == "update":
        return share.can_update
    if action == "delete_file":
        return share.can_delete
    if action == "delete_folder":
        return share.can_delete_folder

    return False


def safe_folder_name(name: str) -> str:
    """ Nettoie un nom de dossier pour l'OS """
    return re.sub(r'[^a-zA-Z0-9_-]', '_', name)

# PAGE ACCUEIL
def home(request):
    return HttpResponse("Bienvenue sur l'API de centralisation des données !")

# AUTHENTIFICATION & UTILISATEURS
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@ratelimit(key='ip', rate='5/10m', method='POST', block=False)
def login_view(request):
    if getattr(request, 'limited', False):
        return Response({'error': 'Trop de tentatives de connexion. Veuillez patienter 10 minutes.'}, status=429)
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if user is None:
        try:
            existing = Utilisateur.objects.get(username=username)
            if not existing.is_active:
                return Response({'error': 'Compte désactivé. Contactez votre administrateur.'}, status=status.HTTP_403_FORBIDDEN)
        except Utilisateur.DoesNotExist:
            pass
        return Response({'error': 'Nom d\'utilisateur ou mot de passe incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)
    token, _ = Token.objects.get_or_create(user=user)
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])

    AuditLog.objects.create(
    utilisateur=user,
    action='LOGIN',
    objet='Système',
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response({'token': token.key, 'role': user.role}, status=status.HTTP_200_OK)

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def update_last_seen(request):
    from django.utils import timezone
    request.user.last_seen = timezone.now()
    request.user.save(update_fields=['last_seen'])
    return Response({'ok': True})

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def get_user_view(request):
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'role': user.role,
        'service': user.service,
        'avatar': user.avatar.url if user.avatar else None,
        'last_login': user.last_login,
        'is_superuser': user.is_superuser,
    })

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def get_all_users(request):
    # Super admin voit tout le monde, admin normal ne voit pas les super_admins
    if hasattr(request.user, 'role') and request.user.role == 'super_admin':
        utilisateurs = Utilisateur.objects.all().only(
            "id", "username", "email", "role", "service", "last_seen", "is_active", "date_joined"
        )
    else:
        utilisateurs = Utilisateur.objects.exclude(role="super_admin").only(
            "id", "username", "email", "role", "service", "last_seen", "is_active", "date_joined"
        )
    data = [
        {
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.role,
            'service': u.service,
            'last_seen': (u.last_seen or u.last_login).isoformat() if (u.last_seen or u.last_login) else None,
            'is_active': u.is_active,
            'date_joined': u.date_joined.isoformat() if u.date_joined else None,
            'is_superuser': u.is_superuser,
        }
        for u in utilisateurs
    ]
    return Response(data)

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_users_for_sharing(request):
    utilisateurs = Utilisateur.objects.exclude(role="super_admin").only("id", "username", "role", "service", "avatar")
    data = [
        {
            'id': u.id,
            'username': u.username,
            'role': u.role,
            'service': u.service,
            'avatar': u.avatar.url if u.avatar else None,
        }
        for u in utilisateurs if u.id != request.user.id and u.role != 'admin'
    ]
    return Response(data)

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def update_password_view(request):
    user = request.user
    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')

    if not user.check_password(old_password):
        return Response({'error': 'Ancien mot de passe incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

    # Vérifie si ancien == nouveau
    if old_password == new_password:
        return Response({'error': 'Le nouveau mot de passe doit être différent de l ancien.'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Vérification robustesse
    if len(new_password) < 8 or not re.search(r'[A-Z]', new_password) or not re.search(r'[0-9]', new_password):
        return Response({'error': 'Le mot de passe est trop faible.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    Token.objects.filter(user=user).delete()
    token = Token.objects.create(user=user)
    
    AuditLog.objects.create(
    utilisateur=user,
    action='UPDATE',
    objet='Mot de passe modifié',
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response({'success': 'Mot de passe mis à jour.', 'token': token.key})


@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def update_user_role(request, user_id):
    try:
        utilisateur = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    # Admin normal ne peut pas modifier le rôle d'un autre admin ou super_admin
    if (hasattr(request.user, 'role') and
        request.user.role == 'admin' and
        utilisateur.role in ['admin', 'super_admin']):
        return Response({"error": "Vous ne pouvez pas modifier le role d'un administrateur."}, status=status.HTTP_403_FORBIDDEN)
    # Admin normal ne peut pas promouvoir au rôle admin ou super_admin
    new_role_requested = request.data.get('role', '').lower()
    if (hasattr(request.user, 'role') and
        request.user.role == 'admin' and
        new_role_requested in ['admin', 'super_admin']):
        return Response({'error': 'Vous ne pouvez pas attribuer le rôle administrateur.'}, status=status.HTTP_403_FORBIDDEN)
    new_role = new_role_requested
    valid_roles = dict((c[0].lower(), c[0]) for c in Utilisateur.ROLE_CHOICES)
    if new_role not in valid_roles:
        return Response({'error': 'Rôle non valide'}, status=status.HTTP_400_BAD_REQUEST)

    if new_role in ['employe', 'responsable'] and not (utilisateur.service or '').strip():
        return Response(
            {'error': f'Un {new_role} doit obligatoirement avoir un service assigné.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    utilisateur.role = valid_roles[new_role]
    utilisateur.save()
    
    AuditLog.objects.create(
    utilisateur=request.user,
    action='UPDATE',
    objet=f"Rôle de {utilisateur.username} → {utilisateur.role}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response({'success': 'Rôle mis à jour'})


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def reset_user_password(request, user_id):
    try:
        utilisateur = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    nouveau_mot_de_passe = get_random_string(length=8)
    utilisateur.set_password(nouveau_mot_de_passe)
    utilisateur.save()

    email_envoye = True
    try:
        send_mail(
            subject='Réinitialisation de mot de passe',
            message=f'Bonjour {utilisateur.username},\n\nVotre mot de passe a été réinitialisé par un administrateur.\n\nNouveau mot de passe : {nouveau_mot_de_passe}\n\nVous pouvez le modifier dans les paramètres de votre compte une fois connecté.\n\nCordialement,\nL\'équipe DMT',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[utilisateur.email],
            fail_silently=False,
        )
    except Exception:
        email_envoye = False

    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Réinitialisation mot de passe : {utilisateur.username}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'success': 'Mot de passe réinitialisé.',
        'new_password': nouveau_mot_de_passe,
        'email_envoye': email_envoye,
    })

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def create_user_account(request):
    username = request.data.get('username', '').strip()
    email = request.data.get('email', '').strip()
    password = request.data.get('password', '')
    role = request.data.get('role', 'employe').lower()
    service = request.data.get('service', '')

    if not username or not password:
        return Response({'error': 'Nom d\'utilisateur et mot de passe obligatoires.'}, status=status.HTTP_400_BAD_REQUEST)

    if Utilisateur.objects.filter(username=username).exists():
        return Response({'error': 'Ce nom d\'utilisateur est déjà pris.'}, status=status.HTTP_400_BAD_REQUEST)

    if email and Utilisateur.objects.filter(email=email).exists():
        return Response({'error': 'Cet email est déjà utilisé.'}, status=status.HTTP_400_BAD_REQUEST)

    valid_roles = [r[0] for r in Utilisateur.ROLE_CHOICES]
    if role not in valid_roles:
        return Response({'error': 'Rôle non valide.'}, status=status.HTTP_400_BAD_REQUEST)

    if role in ['employe', 'responsable'] and not service.strip():
        return Response(
            {'error': f'Un {role} doit obligatoirement avoir un service assigné.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = Utilisateur.objects.create_user(username=username, email=email, password=password)
    user.role = role
    user.service = service
    user.save()

    AuditLog.objects.create(
        utilisateur=request.user,
        action='CREATE',
        objet=f"Création utilisateur : {username}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    if email:
        try:
            send_mail(
                subject="[DMT] Vos coordonnées de connexion — Bienvenue",
                message=f"""Bonjour {username},

Votre compte sur la plateforme DMT (Doumbia Moussa Transport) a été créé avec succès.

Voici vos coordonnées de connexion :

  • Identifiant   : {username}
  • Mot de passe  : {password}
  • Rôle          : {role.replace('employe', 'Employé').replace('responsable', 'Responsable').replace('admin', 'Administrateur')}
  • Service       : {service or 'Non défini'}

Pour vous connecter, rendez-vous sur : http://192.168.1.116/

Pour des raisons de sécurité, nous vous recommandons de modifier votre mot de passe dès votre première connexion.

Cordialement,
Chef de Service Informatique - Équipe DMT
""",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
        except Exception:
            pass
    return Response({"success": "Utilisateur cree.", "id": user.id}, status=status.HTTP_201_CREATED)


@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def update_user_account(request, user_id):
    try:
        utilisateur = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

    username = request.data.get('username', '').strip()
    email = request.data.get('email', '').strip()
    service = request.data.get('service', '')

    if not username:
        return Response({'error': 'Le nom d\'utilisateur est obligatoire.'}, status=status.HTTP_400_BAD_REQUEST)

    if Utilisateur.objects.filter(username=username).exclude(id=user_id).exists():
        return Response({'error': 'Ce nom d\'utilisateur est déjà pris.'}, status=status.HTTP_400_BAD_REQUEST)

    if email and Utilisateur.objects.filter(email=email).exclude(id=user_id).exists():
        return Response({'error': 'Cet email est déjà utilisé.'}, status=status.HTTP_400_BAD_REQUEST)

    if utilisateur.role in ['employe', 'responsable'] and not service.strip():
        return Response(
            {'error': f'Un {utilisateur.role} doit obligatoirement avoir un service assigné.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    old_service = utilisateur.service
    utilisateur.username = username
    utilisateur.email = email
    utilisateur.service = service
    utilisateur.save()

    # Migration : si le service change, migrer les dossiers récents (< 30 jours)
    if old_service != service and service:
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=30)
        migrated_count = Folder.objects.filter(
            proprietaire=utilisateur,
            service=old_service,
            created_at__gte=cutoff
        ).update(service=service)
        if migrated_count > 0:
            AuditLog.objects.create(
                utilisateur=request.user,
                action='UPDATE',
                objet=f"Migration dossiers : {username}",
                details=f"{migrated_count} dossier(s) migré(s) de '{old_service}' vers '{service}'",
            )

    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Mise à jour utilisateur : {username}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({'success': 'Utilisateur mis à jour.', 'username': utilisateur.username, 'email': utilisateur.email, 'service': utilisateur.service})


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def delete_user_account(request, user_id):
    if request.user.id == user_id:
        return Response({'error': 'Vous ne pouvez pas supprimer votre propre compte.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        utilisateur = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

    # Seul is_superuser peut supprimer un super_admin
    if utilisateur.role == 'super_admin' and not request.user.is_superuser:
        return Response({'error': 'Seul le concepteur peut supprimer un super administrateur.'}, status=status.HTTP_403_FORBIDDEN)

    nom = utilisateur.username

    # Trouver le responsable unique du service de l'utilisateur supprimé
    destinataire = request.user
    if utilisateur.service:
        responsables = Utilisateur.objects.filter(
            role='responsable',
            service=utilisateur.service,
            is_active=True
        ).exclude(id=utilisateur.id)
        if responsables.count() == 1:
            destinataire = responsables.first()
        # Si 0 ou 2+ responsables → admin qui supprime

    # Ne pas écraser le service d'origine si le destinataire n'en a pas (ex: admin sans service)
    service_update = {'service': destinataire.service} if destinataire.service else {}

    # 1. Identifier tous les dossiers partagés (racines ET sous-dossiers)
    partages_racines_ids = set(FolderShare.objects.filter(
        folder__proprietaire=utilisateur
    ).values_list('folder_id', flat=True))
    tous_partages_ids = get_descendant_folder_ids(partages_racines_ids) | partages_racines_ids

    # 2. Dossiers privés = tous les dossiers de l'utilisateur SAUF les partagés
    tous_dossiers_ids = set(Folder.objects.filter(
        proprietaire=utilisateur
    ).values_list('id', flat=True))
    prives_ids = tous_dossiers_ids - tous_partages_ids

    # 3. Archiver les dossiers privés
    dossiers_prives = Folder.objects.filter(id__in=prives_ids)
    nb_archives = dossiers_prives.count()
    noms_archives = list(dossiers_prives.values_list('nom', flat=True))
    dossiers_prives.update(is_archived=True, proprietaire=destinataire, **service_update)

    # 4. Réassigner les dossiers partagés (sans archivage)
    dossiers_partages = Folder.objects.filter(id__in=tous_partages_ids)
    noms_partages = list(Folder.objects.filter(
        id__in=partages_racines_ids
    ).values_list('nom', flat=True))
    dossiers_partages.update(proprietaire=destinataire, **service_update)

    utilisateur.delete()

    destinataire_nom = destinataire.username
    detail = f"Suppression utilisateur : {nom} → dossiers transférés à {destinataire_nom}"
    if noms_archives:
        detail += f" | Archivés : {', '.join(noms_archives)}"
    if noms_partages:
        detail += f" | Partagés réassignés : {', '.join(noms_partages)}"
    if len(detail) > 255:
        detail = detail[:252] + '...'

    if destinataire != request.user:
        archives_str = ', '.join(noms_archives) if noms_archives else 'aucun'
        partages_str = ', '.join(noms_partages) if noms_partages else 'aucun'
        Notification.objects.create(
            user=destinataire,
            type='info',
            message=(
                f"{request.user.username} a supprimé le compte {nom}. "
                f"Dossiers transférés → "
                f"Archivés ({len(noms_archives)}) : {archives_str} | "
                f"Partagés ({len(noms_partages)}) : {partages_str}"
            )[:500]
        )

    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=detail,
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )
    return Response({'success': f'Utilisateur {nom} supprimé. {nb_archives} dossier(s) privé(s) archivé(s).'})


@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def toggle_user_active(request, user_id):
    try:
        user = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

    if user.id == request.user.id:
        return Response({'error': 'Vous ne pouvez pas désactiver votre propre compte.'}, status=status.HTTP_400_BAD_REQUEST)

    user.is_active = not user.is_active
    user.save(update_fields=['is_active'])

    if not user.is_active:
        from api.models import FolderShare
        revoked = FolderShare.objects.filter(user=user).count()
        FolderShare.objects.filter(user=user).delete()
        if revoked > 0:
            AuditLog.objects.create(
                utilisateur=request.user,
                action='DELETE',
                objet=f"Révocation de {revoked} partage(s) suite désactivation : {user.username}",
                adresse_ip=request.META.get('REMOTE_ADDR'),
            )

    action = 'activé' if user.is_active else 'désactivé'
    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Compte {action} : {user.username}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'success': f'Compte {action}.',
        'is_active': user.is_active,
    })


# FICHIERS CENTRALISÉS
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def synchroniser_fichiers(request):
    for f in FileModel.objects.all():
        if f.fichier and os.path.exists(f.fichier.path):
            f.taille = os.path.getsize(f.fichier.path)
            f.save(update_fields=['taille'])
    return Response({'success': 'Synchronisation effectuée.'})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def list_centralized_files(request):
    files = FileModel.objects.select_related('utilisateur', 'folder').prefetch_related('folder__shares__user').all()
    data = []
    for f in files:
        shares = []
        shared_date = None
        if f.folder:
            folder_shares = f.folder.shares.select_related('user').all()
            for share in folder_shares:
                shares.append({
                    'username': share.user.username if hasattr(share.user, 'username') else str(share.user),
                    'service': share.user.service if hasattr(share.user, 'service') else '—',
                    'date': share.created_at.strftime('%d/%m/%Y %H:%M'),
                })
            if folder_shares:
                shared_date = folder_shares.order_by('-created_at').first().created_at.strftime('%d/%m/%Y %H:%M')

        data.append({
            'id': f.id,
            'fichier': f.fichier.name if f.fichier else '',
            'nom': f.nom,
            'size': f.taille,
            'date_validation': f.updated_at.strftime('%d/%m/%Y %H:%M'),
            'utilisateur': f.utilisateur.username if f.utilisateur else '—',
            'utilisateur_service': f.utilisateur.service if f.utilisateur and hasattr(f.utilisateur, 'service') else '—',
            'is_shared': len(shares) > 0,
            'shared_count': len(shares),
            'shared_with': shares,
            'shared_date': shared_date,
            'is_orphan': f.folder is None,
            'folder_nom': f.folder.nom if f.folder else None,
        })
    return Response(data)


@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def update_centralized_file(request, file_id):
    try:
        f = FileModel.objects.get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'error': 'Fichier non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

    nouveau_nom = request.data.get('fichier_nom', '').strip()
    if not nouveau_nom:
        return Response({'error': 'Le nom est obligatoire.'}, status=status.HTTP_400_BAD_REQUEST)

    f.nom = nouveau_nom
    f.save(update_fields=['nom'])

    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Renommage fichier #{file_id} → {nouveau_nom}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({'success': 'Fichier renommé.', 'nom': f.nom})


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def delete_centralized_file(request, file_id):
    try:
        f = FileModel.objects.select_related('folder').get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'error': 'Fichier non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

    nom = f.nom
    f.supprimer_fichier()
    f.delete()

    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Suppression fichier : {nom}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({'success': 'Fichier supprimé.'})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def check_file_shared(request, file_id):
    try:
        f = FileModel.objects.select_related('folder').get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'is_shared': False, 'shared_count': 0})

    is_shared = False
    shared_count = 0

    if f.folder:
        shared_count = FolderShare.objects.filter(folder=f.folder).count()
        is_shared = f.folder.is_shared or shared_count > 0

    return Response({
        'is_shared': is_shared,
        'shared_count': shared_count,
        'folder_nom': f.folder.nom if f.folder else None,
    })


# HISTORIQUE (AuditLog)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def get_historique(request):
    logs = AuditLog.objects.select_related('utilisateur').order_by('-timestamp')
    # Masquer les actions du super_admin aux admins normaux
    if hasattr(request.user, 'role') and request.user.role != 'super_admin':
        logs = logs.exclude(utilisateur__role='super_admin')

    action_filter = request.GET.get('action', '')
    search = request.GET.get('search', '')

    if action_filter:
        logs = logs.filter(action=action_filter)
    if search:
        logs = logs.filter(utilisateur__username__icontains=search)

    date_debut = request.GET.get('date_debut', '')
    date_fin = request.GET.get('date_fin', '')

    if date_debut:
        from django.utils.dateparse import parse_date
        d = parse_date(date_debut)
        if d:
            logs = logs.filter(timestamp__date__gte=d)

    if date_fin:
        from django.utils.dateparse import parse_date
        d = parse_date(date_fin)
        if d:
            logs = logs.filter(timestamp__date__lte=d)

    total = logs.count()
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (ValueError, TypeError):
        page = 1
    page_size = 20
    start = (page - 1) * page_size
    end = start + page_size
    logs = logs[start:end]

    data = [
        {
            'id': log.id,
            'objet': log.objet,
            'action': log.action,
            'action_display': log.get_action_display(),
            'date': log.timestamp.strftime('%d/%m/%Y %H:%M'),
            'utilisateur': log.utilisateur.username if log.utilisateur else '—',
            'utilisateur_id': log.utilisateur.id if log.utilisateur else None,
        }
        for log in logs
    ]
    return Response({'results': data, 'total': total, 'page': page, 'page_size': page_size})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def export_historique_csv(request):
    logs = AuditLog.objects.select_related('utilisateur').order_by('-timestamp')

    action_filter = request.GET.get('action', '')
    search = request.GET.get('search', '')
    date_debut = request.GET.get('date_debut', '')
    date_fin = request.GET.get('date_fin', '')

    if action_filter:
        logs = logs.filter(action=action_filter)
    if search:
        logs = logs.filter(utilisateur__username__icontains=search)
    if date_debut:
        from django.utils.dateparse import parse_date
        d = parse_date(date_debut)
        if d:
            logs = logs.filter(timestamp__date__gte=d)
    if date_fin:
        from django.utils.dateparse import parse_date
        d = parse_date(date_fin)
        if d:
            logs = logs.filter(timestamp__date__lte=d)

    from django.utils.timezone import now
    filename = f"journal_activite_{now().strftime('%Y%m%d_%H%M%S')}.csv"

    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response.write('﻿')

    writer = csv.writer(response)
    writer.writerow(['#', 'Utilisateur', 'Action', 'Objet', 'Date'])

    for i, log in enumerate(logs, 1):
        writer.writerow([
            i,
            log.utilisateur.username if log.utilisateur else '—',
            log.get_action_display(),
            log.objet,
            log.timestamp.strftime('%d/%m/%Y %H:%M'),
        ])

    return response


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def restore_folder_from_trash(request, trash_id):
    """Restaurer un dossier depuis la corbeille via soft delete"""
    try:
        item = Trash.objects.get(id=trash_id, item_type='folder')
    except Trash.DoesNotExist:
        return Response({'error': 'Dossier introuvable en corbeille.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        folder = Folder.objects.get(id=item.item_id)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier introuvable en base.'}, status=status.HTTP_404_NOT_FOUND)
    # Restaurer le dossier
    folder.is_deleted = False
    folder.deleted_at = None
    folder.deleted_by = None
    folder.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])

    # Restaurer les parents supprimés récursivement
    parent = folder.parent
    while parent:
        if parent.is_deleted:
            parent.is_deleted = False
            parent.deleted_at = None
            parent.deleted_by = None
            parent.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])
            # Retirer du trash si présent
            Trash.objects.filter(item_type='folder', item_id=parent.id).delete()
        parent = parent.parent

    # Restaurer récursivement tous les sous-dossiers
    all_child_ids = get_descendant_folder_ids({folder.id}) - {folder.id}
    if all_child_ids:
        Folder.objects.filter(id__in=all_child_ids).update(
            is_deleted=False,
            deleted_at=None,
            deleted_by=None
        )
        Trash.objects.filter(item_type='folder', item_id__in=all_child_ids).delete()

    item.delete()
    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Restauration dossier : {folder.nom}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    return Response({'success': f"Dossier '{folder.nom}' restauré."})


def notify_admins_trash(admin_username, count, is_selected=False, ip=''):
    """Notifie tous les admins et super_admins après vidage/suppression corbeille"""
    try:
        recipients = Utilisateur.objects.filter(
            role__in=['admin', 'super_admin']
        ).exclude(username=admin_username)
        emails = [a.email for a in recipients if a.email]
        if not emails:
            return
        action = "éléments sélectionnés" if is_selected else "corbeille complète"
        subject = f'[DMT] 🗑️ Corbeille vidée — {count} élément(s) supprimé(s)'
        body = (
            f"Bonjour,\n\n"
            f"L'administrateur {admin_username} vient de vider la corbeille.\n\n"
            f"Détails :\n"
            f"  • Administrateur : {admin_username}\n"
            f"  • Action         : Suppression {action}\n"
            f"  • Éléments       : {count} supprimé(s) définitivement\n"
            f"  • Adresse IP     : {ip}\n"
            f"  • Date           : {timezone.now().strftime('%d/%m/%Y %H:%M')}\n\n"
            "Cette action est enregistrée dans le Journal d'activité.\n\n"
            "Cordialement,\nDocFlow Pro DMT — Doumbia Moussa Transport"
        )
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, emails, fail_silently=True)
    except Exception as e:
        print(f'Erreur envoi email corbeille: {e}')


def notify_admins_deletion(admin_username, log_info, ip, is_bulk=False):
    """Notifie tous les admins et super_admins par email lors d'une suppression de journal"""
    try:
        # Notifier tous les admins et super_admins sauf l'auteur
        recipients = Utilisateur.objects.filter(
            role__in=['admin', 'super_admin']
        ).exclude(username=admin_username)
        emails = [a.email for a in recipients if a.email]
        if not emails:
            return
        if is_bulk:
            subject = '[DMT] ⚠️ Alerte sécurité — Suppression massive du journal'
            body = (
                f"Bonjour,\n\n"
                f"L'administrateur {admin_username} vient d'effacer l'intégralité du journal d'activité.\n\n"
                f"Détails :\n"
                f"  • Administrateur : {admin_username}\n"
                f"  • Type           : Suppression massive\n"
                f"  • Adresse IP     : {ip}\n"
                f"  • Date           : {log_info.get('date', '—')}\n\n"
                "Cette action est enregistrée dans l'onglet Suppressions du Panneau Administrateur.\n\n"
                "Cordialement,\nDocFlow Pro DMT — Doumbia Moussa Transport"
            )
        else:
            subject = '[DMT] ⚠️ Alerte sécurité — Suppression dans le journal'
            body = (
                f"Bonjour,\n\n"
                f"Une entrée du journal a été supprimée par {admin_username}.\n\n"
                f"Détails :\n"
                f"  • Administrateur       : {admin_username}\n"
                f"  • Utilisateur concerné : {log_info.get('utilisateur', '—')}\n"
                f"  • Action supprimée     : {log_info.get('action', '—')}\n"
                f"  • Objet                : {log_info.get('objet', '—')}\n"
                f"  • Adresse IP           : {ip}\n\n"
                "Cette action est enregistrée dans l'onglet Suppressions du Panneau Administrateur.\n\n"
                "Si suspecte, contactez le Super Administrateur.\n\n"
                "Cordialement,\nDocFlow Pro DMT — Doumbia Moussa Transport"
            )
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, emails, fail_silently=True)
    except Exception as e:
        print(f'Erreur envoi email admins: {e}')

@api_view(["DELETE"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def delete_historique(request, log_id):
    try:
        log = AuditLog.objects.get(id=log_id)
    except AuditLog.DoesNotExist:
        return Response({'error': 'Entree non trouvee.'}, status=status.HTTP_404_NOT_FOUND)
    # Admin normal ne peut pas supprimer ses propres entrées
    if (hasattr(request.user, 'role') and
        request.user.role == 'admin' and
        log.utilisateur and
        log.utilisateur.id == request.user.id):
        return Response({'error': 'Vous ne pouvez pas supprimer vos propres entrées du journal.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        admin = Utilisateur.objects.get(username=request.user.username)
        AuditLogDeletion.objects.create(
            admin=admin,
            deleted_log_id=log.id,
            deleted_utilisateur=log.utilisateur.username if log.utilisateur else '',
            deleted_action=log.action,
            deleted_objet=log.objet,
            adresse_ip=request.META.get('REMOTE_ADDR'),
        )
    except Exception as e:
        print(f'Erreur AuditLogDeletion: {e}')
    notify_admins_deletion(
        request.user.username,
        {'utilisateur': log.utilisateur.username if log.utilisateur else '', 'action': log.action, 'objet': log.objet, 'date': str(log.timestamp)},
        request.META.get('REMOTE_ADDR', ''),
        is_bulk=False
    )
    log.delete()
    return Response({'success': 'Entrée supprimée.'})


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def delete_all_historique(request):
    logs = AuditLog.objects.all()
    try:
        admin = Utilisateur.objects.get(username=request.user.username)
        ip = request.META.get('REMOTE_ADDR')
        AuditLogDeletion.objects.bulk_create([
            AuditLogDeletion(
                admin=admin,
                deleted_log_id=log.id,
                deleted_utilisateur=log.utilisateur.username if log.utilisateur else '',
                deleted_action=log.action,
                deleted_objet=log.objet,
                adresse_ip=ip,
            ) for log in logs
        ])
    except Exception:
        pass
    notify_admins_deletion(
        request.user.username,
        {'date': str(timezone.now())},
        request.META.get('REMOTE_ADDR', ''),
        is_bulk=True
    )
    AuditLog.objects.all().delete()
    return Response({'success': 'Journal efface.'})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def get_disk_usage(request):
    import shutil
    total, used, free = shutil.disk_usage('/')
    return Response({
        'total': total,
        'used': used,
        'free': free,
    })


##### SERVICES #####
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def create_service(request):
    nom = request.data.get('nom', '').strip()
    description = request.data.get('description', '').strip()
    statut = request.data.get('statut', 'actif')
    responsable_id = request.data.get('responsable_id')

    if not nom:
        return Response({'error': 'Le nom est obligatoire.'}, status=status.HTTP_400_BAD_REQUEST)
    if Service.objects.filter(nom=nom).exists():
        return Response({'error': 'Ce service existe déjà.'}, status=status.HTTP_400_BAD_REQUEST)

    responsable = None
    if responsable_id:
        try:
            responsable = Utilisateur.objects.get(id=responsable_id)
        except Utilisateur.DoesNotExist:
            pass

    service = Service.objects.create(
        nom=nom,
        description=description,
        statut=statut,
        responsable=responsable,
    )

    AuditLog.objects.create(
        utilisateur=request.user,
        action='CREATE',
        objet=f"Création service : {nom}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({'success': 'Service créé.', 'id': service.id}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_services(request):
    services = Service.objects.select_related('responsable').all()
    services_list = []
    for s in services:
        nb = Utilisateur.objects.filter(service=s.nom).count()
        services_list.append({
            'id': s.id,
            'nom': s.nom,
            'description': s.description or '',
            'statut': s.statut,
            'responsable': s.responsable.username if s.responsable else '—',
            'responsable_id': s.responsable.id if s.responsable else None,
            'nb_employes': nb,
            'date_creation': s.date_creation.strftime('%d/%m/%Y %H:%M') if s.date_creation else '—',
        })
    return Response(services_list)


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def delete_service(request, service_id):
    try:
        service = Service.objects.get(id=service_id)
        nom = service.nom
        service.delete()
        AuditLog.objects.create(
            utilisateur=request.user,
            action='DELETE',
            objet=f"Suppression service : {nom}",
            adresse_ip=request.META.get('REMOTE_ADDR'),
        )
        return Response({'success': 'Service supprimé.'})
    except Service.DoesNotExist:
        return Response({'error': 'Service non trouvé.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def update_service(request, service_id):
    try:
        service = Service.objects.get(id=service_id)
    except Service.DoesNotExist:
        return Response({'error': 'Service non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

    nom = request.data.get('nom', '').strip()
    description = request.data.get('description', '').strip()
    statut = request.data.get('statut', service.statut)
    responsable_id = request.data.get('responsable_id')

    if not nom:
        return Response({'error': 'Le nom est obligatoire.'}, status=status.HTTP_400_BAD_REQUEST)

    if Service.objects.filter(nom=nom).exclude(id=service_id).exists():
        return Response({'error': 'Ce nom de service existe déjà.'}, status=status.HTTP_400_BAD_REQUEST)

    service.nom = nom
    service.description = description
    service.statut = statut

    if responsable_id:
        try:
            service.responsable = Utilisateur.objects.get(id=responsable_id)
        except Utilisateur.DoesNotExist:
            service.responsable = None
    else:
        service.responsable = None

    service.save()

    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Mise à jour service : {nom}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({'success': 'Service mis à jour.'})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def get_dashboard_stats(request):
    from django.utils import timezone
    from django.utils.timezone import now
    import datetime

    # Users
    total_users = Utilisateur.objects.count()
    active_users = Utilisateur.objects.filter(is_active=True).count()
    inactive_users = Utilisateur.objects.filter(is_active=False).count()
    threshold = now() - datetime.timedelta(minutes=10)
    online_users = Utilisateur.objects.filter(last_seen__gte=threshold, is_active=True).count()
    never_connected = Utilisateur.objects.filter(last_seen__isnull=True, last_login__isnull=True, is_active=True).count()

    # Services
    total_services = Service.objects.count()
    active_services = Service.objects.filter(statut='actif').count()
    inactive_services = Service.objects.filter(statut='inactif').count()

    # Files
    from api.models import File as FileModel
    total_files = FileModel.objects.count()
    total_size = sum(f.taille or 0 for f in FileModel.objects.only('taille'))

    # Répartition par rôle
    role_employe = Utilisateur.objects.filter(role='employe').count()
    role_responsable = Utilisateur.objects.filter(role='responsable').count()
    role_admin = Utilisateur.objects.filter(role='admin').count()
    role_super_admin = Utilisateur.objects.filter(role='super_admin').count()

    # Dossiers
    total_folders = Folder.objects.filter(is_archived=False).count()
    shared_folders = Folder.objects.filter(is_archived=False, is_shared=True).count()
    private_folders = total_folders - shared_folders

    # Journal
    total_logs = AuditLog.objects.count()
    today = now().date()
    today_logs = AuditLog.objects.filter(timestamp__date=today).count()
    last_log = AuditLog.objects.order_by('-timestamp').first()

    # Tendance hebdomadaire — uploads par jour (7 derniers jours)
    weekly_trend = []
    for i in range(6, -1, -1):
        day = today - datetime.timedelta(days=i)
        count = FileModel.objects.filter(updated_at__date=day).count()
        weekly_trend.append({
            'date': day.strftime('%d/%m'),
            'uploads': count,
        })

    return Response({
        'users': {
            'total': total_users,
            'active': active_users,
            'inactive': inactive_users,
            'online': online_users,
            'never_connected': never_connected,
        },
        'services': {
            'total': total_services,
            'active': active_services,
            'inactive': inactive_services,
        },
        'files': {
            'total': total_files,
            'size_mb': round(total_size / 1024 / 1024, 2),
        },
        'journal': {
            'total': total_logs,
            'today': today_logs,
            'last_action': last_log.objet if last_log else '—',
            'last_user': last_log.utilisateur.username if last_log and last_log.utilisateur else '—',
            'last_date': last_log.timestamp.strftime('%d/%m/%Y %H:%M') if last_log else '—',
        },
        'disk': {
            'total_gb': round(shutil.disk_usage(settings.BASE_DIR).total / (1024**3), 1),
            'used_gb': round(shutil.disk_usage(settings.BASE_DIR).used / (1024**3), 1),
            'free_gb': round(shutil.disk_usage(settings.BASE_DIR).free / (1024**3), 1),
            'used_pct': round((shutil.disk_usage(settings.BASE_DIR).used / shutil.disk_usage(settings.BASE_DIR).total) * 100, 1),
        },
        'trash': {
            'total': Trash.objects.count(),
            'fichiers': Trash.objects.filter(item_type='file').count(),
            'dossiers': Trash.objects.filter(item_type='folder').count(),
            'size_mb': round(sum(Trash.objects.values_list('size_bytes', flat=True)) / 1024 / 1024, 2),
        },
        'folders': {
            'total': total_folders,
            'shared': shared_folders,
            'private': private_folders,
        },
        'roles': {
            'employe': role_employe,
            'responsable': role_responsable,
            'admin': role_admin,
            'super_admin': role_super_admin,
        },
        
        'weekly_trend': weekly_trend,
    })


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def get_service_stats(request):
    """Stats du service pour le responsable connecté"""
    user = request.user
    if not hasattr(user, 'role') or user.role != 'responsable' or not user.service:
        return Response({'error': 'Accès réservé aux responsables avec service.'}, status=status.HTTP_403_FORBIDDEN)

    service = user.service
    from datetime import timedelta

    # Membres du service
    membres = Utilisateur.objects.filter(service=service, is_active=True)
    threshold = timezone.now() - timedelta(minutes=10)
    membres_en_ligne = membres.filter(last_seen__gte=threshold).count()

    # Dossiers du service
    dossiers_service = Folder.objects.filter(service=service, is_archived=False, is_deleted=False)
    total_dossiers = dossiers_service.count()
    dossiers_partages = dossiers_service.filter(is_shared=True).count()
    dossiers_prives = total_dossiers - dossiers_partages

    # Fichiers dans les dossiers du service
    from api.models import File as FileModel
    total_fichiers = FileModel.objects.filter(folder__in=dossiers_service).count()
    total_size = sum(f.taille or 0 for f in FileModel.objects.filter(folder__in=dossiers_service).only('taille'))

    # Activité récente du service (7 derniers jours)
    recent_logs = AuditLog.objects.filter(
        utilisateur__service=service,
        timestamp__gte=timezone.now() - timedelta(days=7)
    ).select_related('utilisateur').order_by('-timestamp')[:10]

    # Membres connectés aujourd'hui
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    connectes_aujourdhui = membres.filter(last_login__gte=today_start).values_list('username', flat=True)
    non_connectes_aujourdhui = membres.exclude(last_login__gte=today_start).values_list('username', flat=True)

    # Membres en ligne maintenant (avec noms)
    membres_en_ligne_noms = membres.filter(last_seen__gte=threshold).values_list('username', flat=True)

    activite_recente = [{
        'utilisateur': log.utilisateur.username if log.utilisateur else '—',
        'action': log.action,
        'objet': log.objet,
        'date': log.timestamp.strftime('%d/%m/%Y %H:%M'),
    } for log in recent_logs]

    return Response({
        'service': service,
        'membres': {
            'total': membres.count(),
            'en_ligne': membres_en_ligne,
            'en_ligne_noms': list(membres_en_ligne_noms),
            'connectes_aujourdhui': list(connectes_aujourdhui),
            'non_connectes_aujourdhui': list(non_connectes_aujourdhui),
        },
        'dossiers': {
            'total': total_dossiers,
            'partages': dossiers_partages,
            'prives': dossiers_prives,
        },
        'fichiers': {
            'total': total_fichiers,
            'size_mb': round(total_size / 1024 / 1024, 2),
        },
        'activite_recente': activite_recente,
    })


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def get_cleanup_candidates(request):
    """
    Retourne les dossiers candidats au nettoyage :
    - Dossiers vides (0 fichier, 0 sous-dossier)
    - Dossiers abandonnés (non modifiés depuis 30 jours)
    """
    from datetime import timedelta
    from api.models import File as FileModel

    threshold_abandoned = timezone.now() - timedelta(days=60)

    all_folders = Folder.objects.filter(
        is_deleted=False,
        is_archived=False
    ).select_related('proprietaire')

    empty = []
    abandoned = []

    for folder in all_folders:
        nb_fichiers = FileModel.objects.filter(folder=folder).count()
        nb_enfants = Folder.objects.filter(
            parent=folder,
            is_deleted=False,
            is_archived=False
        ).count()

        parent_nom = folder.parent.nom if folder.parent else None
        item = {
            'id': folder.id,
            'nom': folder.nom,
            'parent_nom': parent_nom,
            'proprietaire': folder.proprietaire.username if folder.proprietaire else '—',
            'service': folder.service or '—',
            'nb_fichiers': nb_fichiers,
            'nb_enfants': nb_enfants,
            'created_at': folder.created_at.strftime('%d/%m/%Y %H:%M'),
            'updated_at': folder.updated_at.strftime('%d/%m/%Y %H:%M'),
        }
        if nb_fichiers == 0 and nb_enfants == 0:
            item['type'] = 'empty'
            empty.append(item)
        elif nb_fichiers == 0 and nb_enfants > 0:
            # Dossier parent vide mais avec sous-dossiers
            item['type'] = 'empty_parent'
            empty.append(item)
        else:
            # Vérifier dernier upload dans le dossier
            from api.models import File as FileModel
            last_upload = FileModel.objects.filter(
                folder=folder
            ).order_by('-updated_at').first()
            if not last_upload or last_upload.updated_at < threshold_abandoned:
                item['type'] = 'abandoned'
                abandoned.append(item)

    return Response({
        'empty': empty,
        'abandoned': abandoned,
        'total_empty': len(empty),
        'total_abandoned': len(abandoned),
    })


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def cleanup_folders(request):
    """
    Déplace en corbeille une liste de dossiers sélectionnés
    Body: { "folder_ids": [1, 2, 3] }
    """
    folder_ids = request.data.get('folder_ids', [])
    if not folder_ids:
        return Response({'error': 'Aucun dossier sélectionné.'}, status=status.HTTP_400_BAD_REQUEST)

    cleaned = 0
    for fid in folder_ids:
        try:
            folder = Folder.objects.get(id=fid, is_deleted=False)
            Trash.objects.create(
                item_type='folder',
                item_id=folder.id,
                nom=folder.nom,
                original_name=folder.original_name,
                deleted_by=request.user,
                folder_nom=folder.nom,
                file_path='',
                size_bytes=0,
                metadata={
                    'service': folder.service,
                    'proprietaire_id': folder.proprietaire.id if folder.proprietaire else None,
                }
            )
            folder.is_deleted = True
            folder.deleted_at = timezone.now()
            folder.deleted_by = request.user
            folder.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])
            # Soft delete récursif sous-dossiers
            all_child_ids = get_descendant_folder_ids({folder.id}) - {folder.id}
            if all_child_ids:
                Folder.objects.filter(id__in=all_child_ids).update(
                    is_deleted=True,
                    deleted_at=timezone.now(),
                    deleted_by=request.user
                )
            cleaned += 1
        except Folder.DoesNotExist:
            continue

    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Nettoyage : {cleaned} dossier(s) déplacés en corbeille",
        adresse_ip=request.META.get('REMOTE_ADDR', '')
    )

    return Response({'success': f'{cleaned} dossier(s) déplacés en corbeille.'})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def get_user_stats(request):
    """Stats personnelles de l'utilisateur connecté"""
    user = request.user
    from datetime import timedelta
    from api.models import File as FileModel

    # Dossiers personnels
    mes_dossiers = Folder.objects.filter(
        proprietaire=user,
        is_archived=False,
        is_deleted=False,
        service=user.service
    )
    total_dossiers = mes_dossiers.count()

    # Fichiers uploadés — exclure ceux dans des dossiers supprimés/archivés
    # (les fichiers sans dossier ne sont jamais exclus)
    from django.db.models import Q
    mes_fichiers = FileModel.objects.filter(
        Q(folder__isnull=True) | Q(folder__is_deleted=False, folder__is_archived=False),
        utilisateur=user,
    )
    total_fichiers = mes_fichiers.count()
    total_size = sum(f.taille or 0 for f in mes_fichiers.only('taille'))

    # Partages reçus
    partages_recus = FolderShare.objects.filter(user=user, folder__is_deleted=False, folder__is_archived=False).count()

    # Partages donnés
    partages_donnes = FolderShare.objects.filter(folder__proprietaire=user, folder__is_deleted=False, folder__is_archived=False).count()

    # Activité récente personnelle (10 dernières actions)
    recent_logs = AuditLog.objects.filter(
        utilisateur=user,
        timestamp__gte=timezone.now() - timedelta(days=30)
    ).order_by('-timestamp')[:10]

    def enrich_objet(log):
        objet = log.objet
        # Si c'est un sous-dossier, chercher le parent
        if 'Dossier :' in objet and 'Sous-dossier :' not in objet and ' dans ' not in objet:
            nom = objet.split(':', 1)[-1].strip()
            try:
                folder = Folder.objects.filter(nom=nom, proprietaire=user).first()
                if folder and folder.parent:
                    return f"{objet} (└ {folder.parent.nom})"
            except Exception:
                pass
        return objet

    activite_recente = [{
        'action': log.action,
        'objet': enrich_objet(log),
        'date': log.timestamp.strftime('%d/%m/%Y %H:%M'),
    } for log in recent_logs]

    # Taille par dossier (top 5)
    top_dossiers = []
    def get_folder_stats_recursive(folder):
        """Calcule taille + nb fichiers récursivement"""
        all_ids = get_descendant_folder_ids({folder.id})
        all_ids.add(folder.id)
        fichiers = FileModel.objects.filter(folder__id__in=all_ids)
        total_size = sum(f.taille or 0 for f in fichiers.only('taille'))
        return {
            'nom': folder.nom,
            'parent': folder.parent.nom if folder.parent else None,
            'size_mb': round(total_size / 1024 / 1024, 2),
            'nb_fichiers': fichiers.count(),
        }

    for folder in mes_dossiers.order_by('-created_at')[:10]:
        top_dossiers.append(get_folder_stats_recursive(folder))
    top_dossiers = sorted(top_dossiers, key=lambda x: x['size_mb'], reverse=True)[:5]

    # Détail dossiers avec hiérarchie
    dossiers_raw = []
    for f in mes_dossiers.order_by('nom'):
        dossiers_raw.append({
            'nom': f.nom,
            'parent': f.parent.nom if f.parent else None,
            'niveau': 1 if f.parent else 0,
            'nb_fichiers': FileModel.objects.filter(folder=f).count(),
        })
    # Trier : racines d'abord puis sous-dossiers regroupés
    dossiers_detail = []
    for d in [x for x in dossiers_raw if x['niveau'] == 0]:
        dossiers_detail.append(d)
        for sub in [x for x in dossiers_raw if x['parent'] == d['nom']]:
            dossiers_detail.append(sub)
    # Ajouter sous-dossiers orphelins (parent non propriétaire)
    noms_ajoutes = {d['nom'] for d in dossiers_detail}
    for d in dossiers_raw:
        if d['nom'] not in noms_ajoutes:
            dossiers_detail.append(d)

    # Détail partages reçus
    partages_recus_detail = []
    for share in FolderShare.objects.filter(
        user=user,
        folder__is_deleted=False,
        folder__is_archived=False
    ).select_related('folder', 'folder__proprietaire')[:10]:
        partages_recus_detail.append({
            'dossier': share.folder.nom,
            'proprietaire': f"{share.folder.proprietaire.username} ({share.folder.proprietaire.service or 'Sans service'})" if share.folder.proprietaire else '—',
        })

    # Détail fichiers par type
    from collections import Counter
    extensions = []
    for f in mes_fichiers.only('nom'):
        parts = f.nom.rsplit('.', 1)
        ext = parts[-1].lower() if len(parts) > 1 and parts[-1] and len(parts[-1]) <= 5 else 'autre'
        extensions.append(ext)
    ext_counter = Counter(extensions)
    # Top 5 extensions + "autre" pour tout le reste
    top5 = ext_counter.most_common(5)
    top5_count = sum(v for _, v in top5)
    autres = total_fichiers - top5_count
    fichiers_detail = [{'ext': k, 'count': v} for k, v in top5]
    if autres > 0:
        fichiers_detail.append({'ext': 'autre', 'count': autres})

    # Détail partages donnés
    partages_donnes_detail = []
    for share in FolderShare.objects.filter(
        folder__proprietaire=user,
        folder__is_deleted=False,
        folder__is_archived=False
    ).select_related('user', 'folder')[:10]:
        partages_donnes_detail.append({
            'dossier': share.folder.nom,
            'destinataire': f"{share.user.username} ({share.user.service or 'Sans service'})",
        })

    return Response({
        'username': user.username,
        'service': user.service or '—',
        'dossiers': {
            'total': total_dossiers,
            'detail': dossiers_detail,
        },
        'fichiers': {
            'total': total_fichiers,
            'size_mb': round(total_size / 1024 / 1024, 2),
            'detail': fichiers_detail,
        },
        'partages': {
            'recus': partages_recus,
            'recus_detail': partages_recus_detail,
            'donnes': partages_donnes,
            'donnes_detail': partages_donnes_detail,
        },
        'top_dossiers': top_dossiers,
        'activite_recente': activite_recente,
    })


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def search_files(request):
    """
    Recherche globale de fichiers accessibles par l'utilisateur.
    Paramètre : ?q=terme
    """
    query = request.GET.get('q', '').strip()
    if not query or len(query) < 2:
        return Response({'results': [], 'total': 0})

    user = request.user

    # Dossiers accessibles par l'utilisateur
    owned_folders = Folder.objects.filter(proprietaire=user, is_archived=False)
    shared_folder_ids = get_descendant_folder_ids(
        set(FolderShare.objects.filter(user=user).values_list('folder_id', flat=True))
    )
    shared_folders = Folder.objects.filter(id__in=shared_folder_ids, is_archived=False)

    # Responsable : accès aux dossiers de son service
    service_folders = Folder.objects.none()
    if hasattr(user, 'role') and user.role == 'responsable' and user.service:
        service_folders = Folder.objects.filter(service=user.service, is_archived=False)

    accessible_folders = (owned_folders | shared_folders | service_folders).distinct()

    # Recherche fichiers par nom
    from api.models import File as FileModel
    from django.db.models import Q
    # Fichiers dont l'historique des noms contient la query
    history_file_ids = FileRenameHistory.objects.filter(
        old_name__icontains=query
    ).values_list('file_id', flat=True)

    results = FileModel.objects.filter(
        Q(nom__icontains=query) | Q(original_name__icontains=query) | Q(id__in=history_file_ids),
        folder__in=accessible_folders
    ).select_related('folder', 'folder__proprietaire', 'utilisateur').order_by('-updated_at')[:20]

    data = []
    for f in results:
        data.append({
            'id': f.id,
            'nom': f.nom,
            'type_fichier': f.type_fichier,
            'taille': f.taille,
            'updated_at': f.updated_at,
            'folder': {
                'id': f.folder.id,
                'nom': f.folder.nom,
            },
            'uploadeur': f.utilisateur.username if f.utilisateur else '—',
        })

    return Response({'results': data, 'total': len(data)})


# FOLDERS CRUD
def get_descendant_folder_ids(folder_ids):
    """Retourne récursivement tous les IDs des sous-dossiers"""
    all_ids = set(folder_ids)
    current_level = set(folder_ids)
    while current_level:
        children = set(
            Folder.objects.filter(
                parent__in=current_level,
                is_archived=False
            ).values_list('id', flat=True)
        )
        new_children = children - all_ids
        if not new_children:
            break
        all_ids.update(new_children)
        current_level = new_children
    return all_ids


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_folders_service(request):
    """
    Retourne tous les dossiers des employés du même service
    que le responsable connecté + ceux partagés avec lui.
    """
    user = request.user

    if not user.service:
        return Response(
            {'error': 'Aucun service associé à ce compte.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    service_folders = Folder.objects.filter(
        service=user.service,
        is_archived=False,
        is_deleted=False
    ).prefetch_related("shares__user")

    shared_direct = Folder.objects.filter(
        shares__user=user
    ).exclude(
        service=user.service
    )
    shared_ids = set(shared_direct.values_list('id', flat=True))
    all_shared_ids = get_descendant_folder_ids(shared_ids)
    shared = Folder.objects.filter(
        id__in=all_shared_ids,
        is_archived=False,
        is_deleted=False
    ).prefetch_related("shares__user")

    all_folders = (service_folders | shared).distinct()

    serializer = FolderSerializer(
        all_folders, many=True, context={"request": request}
    )
    data = serializer.data

    # Injecter permissions complètes pour les dossiers du service
    # dont le responsable n'est pas propriétaire
    for folder in data:
        if not folder.get("permissions"):
            folder["permissions"] = {
                "can_read": True,
                "can_write": False,
                "can_update": False,
                "can_delete": False,
                "can_delete_folder": False,
                "can_share": False,
            }

    return Response(data)


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_folders(request):
    """
    Retourne tous les dossiers appartenant à l'utilisateur
    + ceux qui lui sont partagés, avec le parent bien sérialisé.
    """
    folders = Folder.objects.filter(
        proprietaire=request.user,
        is_archived=False,
        is_deleted=False
    ).prefetch_related("shares__user")

    shared_direct = Folder.objects.filter(
        shares__user=request.user
    )
    shared_ids = set(shared_direct.values_list('id', flat=True))
    all_shared_ids = get_descendant_folder_ids(shared_ids)
    shared = Folder.objects.filter(
        id__in=all_shared_ids,
        is_archived=False,
        is_deleted=False
    ).prefetch_related("shares__user")
    all_folders = (folders | shared).distinct()

    serializer = FolderSerializer(all_folders, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def create_folder(request):
    nom = request.data.get('nom')
    if not nom:
        return Response({'error': 'Nom requis'}, status=status.HTTP_400_BAD_REQUEST)

    folder = Folder.objects.create(nom=nom, proprietaire=request.user, service=request.user.service)

    folder.original_name = nom
    folder.save(update_fields=['original_name'])

    folder_name = f"{folder.id}_{safe_folder_name(folder.nom)}"
    folder_path = os.path.join(settings.MEDIA_ROOT, "uploads", folder_name)
    os.makedirs(folder_path, exist_ok=True)

    AuditLog.objects.create(
    utilisateur=request.user,
    action='CREATE',
    objet=f"Dossier : {folder.nom}",
    adresse_ip=request.META.get('REMOTE_ADDR')
)
    
    return Response(
        FolderSerializer(folder, context={"request": request}).data,
        status=status.HTTP_201_CREATED
    )


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def create_subfolder(request, parent_id):
    """
    Permet à l'utilisateur de créer un sous-dossier dans un dossier existant.
    """
    try:
        parent_folder = Folder.objects.get(id=parent_id)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier parent introuvable'}, status=status.HTTP_404_NOT_FOUND)

    if not has_folder_permission(request.user, parent_folder, "write"):
        return Response({'error': '⛔ Vous n avez pas la permission de creer un sous-dossier ici.'},
                        status=status.HTTP_403_FORBIDDEN)

    if parent_folder.parent is not None:
        return Response({'error': 'Niveau max atteint. 2 niveaux maximum autorises.'}, status=status.HTTP_400_BAD_REQUEST)

    nom = request.data.get('nom')
    if not nom:
        return Response({'error': 'Nom requis'}, status=status.HTTP_400_BAD_REQUEST)

    # création du sous-dossier
    subfolder = Folder.objects.create(
        nom=nom,
        proprietaire=request.user,
        service=request.user.service,
        parent=parent_folder  # nécessite que le modèle Folder ait un champ parent = ForeignKey('self', null=True, blank=True)
    )

    subfolder.original_name = nom
    subfolder.save(update_fields=['original_name'])

    # Crée le dossier physique imbriqué
    parent_path = os.path.join(settings.MEDIA_ROOT, "uploads", f"{parent_folder.id}_{safe_folder_name(parent_folder.nom)}")
    sub_path = os.path.join(parent_path, f"{subfolder.id}_{safe_folder_name(subfolder.nom)}")
    os.makedirs(sub_path, exist_ok=True)

    logger.info(f"[SUBFOLDER] Sous-dossier '{nom}' créé dans '{parent_folder.nom}' par {request.user.username}")

    AuditLog.objects.create(
        utilisateur=request.user,
        action='CREATE',
        objet=f"Sous-dossier : {nom} dans {parent_folder.nom}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    return Response(FolderSerializer(subfolder, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def rename_folder(request, folder_id):
    try:
        folder = Folder.objects.get(id=folder_id)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if not has_folder_permission(request.user, folder, "update"):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    new_name = request.data.get('nom')
    if not new_name:
        return Response({'error': 'Nom invalide'}, status=status.HTTP_400_BAD_REQUEST)

    old_folder_name = f"{folder.id}_{safe_folder_name(folder.nom)}"
    new_folder_name = f"{folder.id}_{safe_folder_name(new_name)}"

    old_path = os.path.join(settings.MEDIA_ROOT, "uploads", old_folder_name)
    new_path = os.path.join(settings.MEDIA_ROOT, "uploads", new_folder_name)

    # Renommer physiquement le dossier
    if os.path.exists(old_path):
        os.rename(old_path, new_path)

        # Mettre à jour les chemins de tous les fichiers liés
        for file in folder.files.all():
            if file.fichier:
                old_file_path = file.fichier.path
                new_file_path = old_file_path.replace(old_folder_name, new_folder_name, 1)

                if os.path.exists(old_file_path):
                    os.rename(old_file_path, new_file_path)

                # Mettre à jour le champ fichier
                relative_path = os.path.relpath(new_file_path, settings.MEDIA_ROOT)
                file.fichier.name = relative_path
                file.save(update_fields=["fichier"])

    # Mettre à jour le nom du dossier en base
    folder.nom = new_name
    folder.save(update_fields=["nom"])

    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Dossier renommé : {new_name}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )

    return Response(FolderSerializer(folder, context={"request": request}).data)


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def delete_folder(request, folder_id):
    try:
        folder = Folder.objects.get(id=folder_id)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if not has_folder_permission(request.user, folder, "delete_folder"):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    folder_name = f"{folder.id}_{safe_folder_name(folder.nom)}"
    folder_path = os.path.join(settings.MEDIA_ROOT, "uploads", folder_name)

    # Soft delete — marquer comme supprimé sans supprimer physiquement
    Trash.objects.create(
        item_type='folder',
        item_id=folder.id,
        nom=folder.nom,
        original_name=folder.original_name,
        deleted_by=request.user,
        folder_nom=folder.nom,
        file_path=folder_path,
        size_bytes=0,
        metadata={
            'service': folder.service,
            'proprietaire_id': folder.proprietaire.id if folder.proprietaire else None,
        }
    )
    folder.is_deleted = True
    folder.deleted_at = timezone.now()
    folder.deleted_by = request.user
    folder.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])

    # Soft delete récursif sur tous les sous-dossiers
    all_child_ids = get_descendant_folder_ids({folder.id}) - {folder.id}
    if all_child_ids:
        Folder.objects.filter(id__in=all_child_ids).update(
            is_deleted=True,
            deleted_at=timezone.now(),
            deleted_by=request.user
        )
    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Dossier : {folder.nom}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    return Response({'success': 'Dossier déplacé en corbeille.'})


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def share_folder(request, folder_id):
    try:
        folder = Folder.objects.get(id=folder_id)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    user = request.user
    is_owner = folder.proprietaire == user
    is_responsable_service = (
        hasattr(user, 'role') and
        user.role == 'responsable' and
        folder.service and
        folder.service == user.service
    )
    has_share_permission = FolderShare.objects.filter(
        folder=folder, user=user, can_read=True
    ).exists()

    if not is_owner and not is_responsable_service and not has_share_permission:
        return Response({'error': 'Permission insuffisante pour partager ce dossier.'}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data
    if not isinstance(payload, list):
        return Response(
            {'error': "Format attendu : liste d'utilisateurs avec permissions."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Garder trace des partages existants avant suppression
    existing_user_ids = set(FolderShare.objects.filter(folder=folder).values_list('user_id', flat=True))
    payload_user_ids = set(entry.get('user_id') for entry in payload)
    # Supprimer les partages révoqués uniquement
    FolderShare.objects.filter(folder=folder).exclude(user_id__in=payload_user_ids).delete()

    for entry in payload:
        user_id = entry.get("user_id")
        perms = entry.get("permissions", {})

        try:
            user = Utilisateur.objects.get(id=user_id)
        except Utilisateur.DoesNotExist:
            continue

        # Créer ou mettre à jour le partage
        share, created = FolderShare.objects.update_or_create(
            folder=folder,
            user=user,
            defaults={
                "can_read": perms.get("read", True),
                "can_write": perms.get("write", False),
                "can_update": perms.get("update", False),
                "can_delete": perms.get("delete", False),
                "can_delete_folder": perms.get("delete_folder", False),
            }
        )

        # Notifier uniquement si nouveau partage
        if user.id not in existing_user_ids:
            Notification.objects.create(
                user=user,
                type="share",
                message=f"📂 Nouveau dossier partage par {request.user.username} : {folder.nom}"
            )
        else:
            Notification.objects.create(
                user=user,
                type="permission",
                message=f"✏️ Permissions mises a jour pour le dossier : {folder.nom}"
            )

    folder.is_shared = True
    folder.save()

    logger.info(f"[SHARE] Dossier '{folder.nom}' partagé par {request.user.username}")
    
    AuditLog.objects.create(
    utilisateur=request.user,
    action='UPDATE',
    objet=f"Dossier partagé : {folder.nom}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response(
        FolderSerializer(folder, context={"request": request}).data,
        status=status.HTTP_200_OK
    )

##### FILES CRUD #####
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_files_by_folder(request, folder_id):
    try:
        folder = Folder.objects.get(id=folder_id)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if not has_folder_permission(request.user, folder, "read"):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    files = FileModel.objects.filter(folder=folder).select_related("utilisateur", "folder")
    return Response(FileSerializer(files, many=True, context={'request': request}).data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def upload_file(request, folder_id):
    try:
        folder = Folder.objects.get(id=folder_id)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if not has_folder_permission(request.user, folder, "write"):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    fichier = request.FILES.get('file')
    if not fichier:
        return Response({'error': 'Aucun fichier fourni'}, status=status.HTTP_400_BAD_REQUEST)

    # Vérif type MIME autorisé
    allowed_mimes = [
        "text/plain", "application/pdf", "image/png", "image/jpeg",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "audio/mpeg", "audio/wav",
        "video/mp4", "video/x-matroska", "video/x-msvideo", "video/quicktime"

    ]

    if fichier.content_type not in allowed_mimes:
        return Response({'error': 'Type de fichier non autorisé'}, status=status.HTTP_400_BAD_REQUEST)

    base, ext = os.path.splitext(fichier.name)
    today = timezone.now().strftime("%Y-%m-%d")
    new_name = f"{base}_{today}{ext}"

    counter = 1
    while FileModel.objects.filter(folder=folder, nom=new_name).exists():
        new_name = f"{base}_{today}({counter}){ext}"
        counter += 1

    fichier.name = new_name

    hasher = hashlib.sha256()
    for chunk in fichier.chunks():
        hasher.update(chunk)

    file_instance = FileModel.objects.create(
    folder=folder,
    utilisateur=request.user,
    fichier=fichier,
    nom=new_name,
    taille=fichier.size,
    type_fichier=fichier.content_type or "application/octet-stream",
    file_hash=hasher.hexdigest()
    )

    file_instance.original_name = base
    file_instance.save(update_fields=['original_name'])

    # Notifier le propriétaire si ce n'est pas lui qui a uploadé
    if request.user != folder.proprietaire:
        Notification.objects.create(
            user=folder.proprietaire,
            type="upload",
            message=f"📤 {request.user.username} a ajouté le fichier « {file_instance.nom} » "
                    f"dans le dossier « {folder.nom} »"
        )

    logger.info(f"[UPLOAD] Fichier '{file_instance.nom}' uploadé par {request.user.username}")
    
    AuditLog.objects.create(
    utilisateur=request.user,
    action='UPLOAD',
    objet=f"Fichier : {file_instance.nom} → {folder.nom}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response(FileSerializer(file_instance, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def rename_file(request, file_id):
    """
    Renommer un fichier si l'utilisateur a la permission can_update
    """
    try:
        file_obj = FileModel.objects.get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'error': 'Fichier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if not has_folder_permission(request.user, file_obj.folder, "update"):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    new_name = request.data.get("nom")
    if not new_name:
        return Response({'error': 'Nom invalide'}, status=status.HTTP_400_BAD_REQUEST)

    # Extraire la date d'upload originale du nom actuel ou de updated_at
    import re
    date_pattern = r'_\d{4}-\d{2}-\d{2}$'
    # Récupérer la date depuis le nom original ou le fichier
    original_date_match = re.search(r'(\d{4}-\d{2}-\d{2})', file_obj.nom)
    upload_date = original_date_match.group(1) if original_date_match else file_obj.updated_at.strftime('%Y-%m-%d')

    # Supprimer toute date existante dans le nouveau nom
    base_new_name = re.sub(r'_\d{4}-\d{2}-\d{2}(\(\d+\))?(\.[^.]+)?$', '', new_name)
    # Séparer extension
    base_no_ext, ext = os.path.splitext(base_new_name)
    # Reconstruire avec date d'upload immuable
    new_name = f"{base_no_ext}_{upload_date}{ext}"

    # Mise à jour en base
    old_name = file_obj.nom
    file_obj.nom = new_name
    file_obj.save(update_fields=["nom", "updated_at"])

    FileRenameHistory.objects.create(
        file=file_obj,
        old_name=old_name,
        new_name=new_name,
        renamed_by=request.user
    )

    logger.info(f"[RENAME] Fichier renommé en '{new_name}' par {request.user.username}")
    
    AuditLog.objects.create(
    utilisateur=request.user,
    action='UPDATE',
    objet=f"Fichier renommé : {new_name}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    # Notifications — propriétaire du dossier uniquement (si ce n'est pas lui qui renomme)
    folder = file_obj.folder
    if folder.proprietaire != request.user:
        Notification.objects.create(
            user=folder.proprietaire,
            type="info",
            message=f"{request.user.username} a renommé le fichier '{old_name}' → '{new_name}' dans le dossier '{folder.nom}'."
        )

    return Response(FileSerializer(file_obj, context={"request": request}).data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def move_file(request, file_id):
    """
    Déplacer un fichier vers un autre dossier.
    Seul le propriétaire du fichier peut le déplacer.
    Le dossier destination doit lui appartenir.
    """
    try:
        file_obj = FileModel.objects.get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'error': 'Fichier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if file_obj.utilisateur != request.user:
        return Response({'error': 'Seul le propriétaire du fichier peut le déplacer.'}, status=status.HTTP_403_FORBIDDEN)

    dest_folder_id = request.data.get('folder_id')
    if not dest_folder_id:
        return Response({'error': 'Dossier destination requis.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        dest_folder = Folder.objects.get(id=dest_folder_id, proprietaire=request.user)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier destination non trouvé ou non autorisé.'}, status=status.HTTP_404_NOT_FOUND)

    if dest_folder.id == file_obj.folder.id:
        return Response({'error': 'Le fichier est déjà dans ce dossier.'}, status=status.HTTP_400_BAD_REQUEST)

    old_folder_nom = file_obj.folder.nom
    file_obj.folder = dest_folder
    file_obj.save(update_fields=['folder', 'updated_at'])

    AuditLog.objects.create(
        utilisateur=request.user,
        action='UPDATE',
        objet=f"Fichier déplacé : {file_obj.nom}",
        details=f"De '{old_folder_nom}' vers '{dest_folder.nom}'",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )

    return Response({'success': f"Fichier déplacé vers '{dest_folder.nom}'."})


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def delete_file(request, file_id):
    try:
        file_obj = FileModel.objects.get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'error': 'Fichier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if not has_folder_permission(request.user, file_obj.folder, "delete_file"):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    folder = file_obj.folder
    file_nom = file_obj.nom
    # Déplacer en corbeille au lieu de supprimer
    Trash.objects.create(
        item_type='file',
        item_id=file_obj.id,
        nom=file_obj.nom,
        original_name=file_obj.original_name,
        deleted_by=request.user,
        folder_nom=folder.nom,
        file_path=file_obj.fichier.name if file_obj.fichier else '',
        size_bytes=file_obj.taille or 0,
        metadata={
            'folder_id': folder.id,
            'type_fichier': file_obj.type_fichier,
            'uploadeur_id': file_obj.utilisateur.id if file_obj.utilisateur else None,
        }
    )
    file_obj.delete()
    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Fichier : {file_nom}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    logger.info(f"[DELETE] Fichier '{file_nom}' supprimé par {request.user.username}")

    # Notifications — propriétaire + tous les destinataires sauf l'auteur
    destinataires = set()
    if folder.proprietaire != request.user:
        destinataires.add(folder.proprietaire)
    for share in FolderShare.objects.filter(folder=folder).select_related('user'):
        if share.user != request.user:
            destinataires.add(share.user)
    for dest in destinataires:
        Notification.objects.create(
            user=dest,
            type="warning",
            message=f"{request.user.username} a supprimé le fichier '{file_nom}' dans le dossier '{folder.nom}'."
        )
    return Response({'success': 'Fichier supprimé'})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def list_trash(request):
    items = Trash.objects.all()
    total_size = sum(i.size_bytes for i in items)
    def get_parent_nom(item):
        if item.item_type == 'folder':
            try:
                folder = Folder.objects.get(id=item.item_id)
                if folder.parent:
                    return folder.parent.nom
            except Folder.DoesNotExist:
                pass
        return None

    data = [{
        'id': i.id,
        'item_type': i.item_type,
        'nom': i.nom,
        'original_name': i.original_name,
        'deleted_by': i.deleted_by.username if i.deleted_by else '—',
        'deleted_at': i.deleted_at.strftime('%d/%m/%Y %H:%M'),
        'folder_nom': i.folder_nom,
        'size_bytes': i.size_bytes,
        'parent_nom': get_parent_nom(i),
    } for i in items]
    return Response({'items': data, 'total': len(data), 'total_size_mb': round(total_size / 1024 / 1024, 2)})


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def empty_trash(request):
    """Vider la corbeille après vérification credentials admin"""
    email = request.data.get('email')
    password = request.data.get('password')
    if not email or not password:
        return Response({'error': 'Email et mot de passe requis.'}, status=status.HTTP_400_BAD_REQUEST)
    from django.contrib.auth import authenticate
    user = authenticate(username=request.user.username, password=password)
    if not user or user.email != email:
        return Response({'error': 'Credentials invalides.'}, status=status.HTTP_403_FORBIDDEN)
    ids = request.data.get('ids', None)
    if ids:
        qs = Trash.objects.filter(id__in=ids)
    else:
        qs = Trash.objects.all()
    count = qs.count()
    qs.delete()
    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Corbeille vidée : {count} éléments supprimés définitivement",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    notify_admins_trash(
        admin_username=request.user.username,
        count=count,
        is_selected=False,
        ip=request.META.get('REMOTE_ADDR', '')
    )
    return Response({'success': f'{count} éléments supprimés définitivement.'})


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def delete_trash_item(request, trash_id):
    """Supprimer un élément définitivement de la corbeille"""
    try:
        item = Trash.objects.get(id=trash_id)
    except Trash.DoesNotExist:
        return Response({'error': 'Élément introuvable.'}, status=status.HTTP_404_NOT_FOUND)
    item.delete()
    return Response({'success': 'Élément supprimé définitivement.'})


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def restore_trash_item(request, trash_id):
    """Restaurer un élément depuis la corbeille"""
    try:
        item = Trash.objects.get(id=trash_id)
    except Trash.DoesNotExist:
        return Response({'error': 'Élément introuvable.'}, status=status.HTTP_404_NOT_FOUND)

    if item.item_type == 'file':
        # Vérifier que le dossier parent existe encore
        folder_id = item.metadata.get('folder_id')
        try:
            folder = Folder.objects.get(id=folder_id)
        except Folder.DoesNotExist:
            return Response({'error': 'Dossier parent introuvable — restauration impossible.'}, status=status.HTTP_400_BAD_REQUEST)
        # Recréer l'entrée fichier en DB (le fichier physique est encore sur disque)
        from api.models import File as FileModel
        file_obj = FileModel.objects.create(
            nom=item.nom,
            original_name=item.original_name,
            folder=folder,
            fichier=item.file_path,
            taille=item.size_bytes,
            type_fichier=item.metadata.get('type_fichier', ''),
            utilisateur_id=item.metadata.get('uploadeur_id'),
        )
        item.delete()
        AuditLog.objects.create(
            utilisateur=request.user,
            action='UPDATE',
            objet=f"Restauration fichier : {item.nom}",
            adresse_ip=request.META.get('REMOTE_ADDR')
        )
        return Response({'success': f"Fichier '{item.nom}' restauré."})

    elif item.item_type == 'folder':
        return Response({'error': 'Restauration de dossier non supportée — complexité trop élevée.'}, status=status.HTTP_400_BAD_REQUEST)

# FILE PREVIEW
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def preview_file(request, file_id):
    try:
        file_obj = FileModel.objects.get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'error': 'Fichier non trouvé'}, status=404)

    if not has_folder_permission(request.user, file_obj.folder, "read"):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    ext = file_obj.extension.lower() if file_obj.extension else None
    if not ext:
        return Response({"type": "unsupported", "message": "Extension inconnue"})

    # URL sécurisée avec token + cache-busting
    token = Token.objects.get(user=request.user)
    timestamp = int(timezone.now().timestamp() * 1000)
    secure_url = request._request.build_absolute_uri(
        f"/api/files/{file_obj.id}/view/?token={token.key}&t={timestamp}"
    )

    # Textes
    if ext in ["txt", "log"]:
        if not os.path.exists(file_obj.fichier.path):
            return Response({"error": "Fichier introuvable"}, status=404)
        with open(file_obj.fichier.path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read(5000)
        return Response({"type": "text", "content": content})

    # CSV
    if ext == "csv":
        rows = []
        with open(file_obj.fichier.path, newline="", encoding="utf-8", errors="ignore") as f:
            reader = csv.reader(f)
            for i, row in enumerate(reader):
                if i >= 20:
                    break
                rows.append(row)
        return Response({"type": "table", "rows": rows})

    # Images, PDF, Office
    if ext in ["pdf", "png", "jpg", "jpeg", "xlsx", "xls", "docx", "doc"]:
        return Response({"type": "url", "url": secure_url})

    # Audio
    if ext in ["mp3", "wav", "ogg"]:
        return Response({"type": "audio", "url": secure_url})

    # Vidéo
    if ext in ["mp4", "mkv", "avi", "mov"]:
        return Response({"type": "video", "url": secure_url})

    # Sinon
    return Response({"type": "unsupported", "message": "Pas d'aperçu disponible"})


@api_view(['GET'])
@authentication_classes([])  # gestion manuelle
@permission_classes([])      
def view_file(request, file_id):
    from rest_framework.authtoken.models import Token

    # Récupérer token depuis GET si pas authentifié
    user = request.user if request.user.is_authenticated else None
    if not user:
        token_key = request.GET.get("token")
        if token_key:
            try:
                token = Token.objects.get(key=token_key)
                user = token.user
            except Token.DoesNotExist:
                return Response({'error': 'Token invalide'}, status=401)

    if not user:
        return Response({'error': 'Non authentifié'}, status=401)

    try:
        file_obj = FileModel.objects.get(id=file_id)
    except FileModel.DoesNotExist:
        return Response({'error': 'Fichier introuvable en base'}, status=404)

    if not has_folder_permission(user, file_obj.folder, "read"):
        return Response({'error': 'Accès refusé'}, status=403)

    if not file_obj.fichier or not os.path.exists(file_obj.fichier.path):
        logger.error(f"[STORAGE ERROR] Fichier manquant : {file_obj.nom}")
        return Response({"error": "⚠️ Le fichier est introuvable"}, status=404)

    response = FileResponse(open(file_obj.fichier.path, 'rb'), content_type=file_obj.type_fichier)
    response['Content-Disposition'] = f'inline; filename="{file_obj.nom}"'
    return response


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_shared_files(request):
    shared_folders = FolderShare.objects.filter(user=request.user).select_related("folder__proprietaire")
    files = FileModel.objects.filter(folder__in=[s.folder for s in shared_folders]).select_related("folder", "utilisateur")
    share_map = {s.folder_id: s for s in shared_folders}
    data = []
    for file in files:
        share = share_map.get(file.folder_id)
        data.append({
            **FileSerializer(file, context={'request': request}).data,
            "shared_by": file.folder.proprietaire.username if file.folder.proprietaire else '—',
            "shared_at": share.created_at if share else None,
        })
    # Filtres
    search = request.query_params.get("search", "").lower()
    shared_by = request.query_params.get("shared_by", "")
    date_from = request.query_params.get("date_from", "")
    date_to = request.query_params.get("date_to", "")
    if search:
        data = [f for f in data if search in f["nom"].lower()]
    if shared_by:
        data = [f for f in data if f["shared_by"] == shared_by]
    if date_from:
        data = [f for f in data if f["shared_at"] and str(f["shared_at"])[:10] >= date_from]
    if date_to:
        data = [f for f in data if f["shared_at"] and str(f["shared_at"])[:10] <= date_to]
    # Tri par date décroissante
    data.sort(key=lambda x: x["shared_at"] or "", reverse=True)
    total = len(data)
    # Pagination
    page = int(request.query_params.get("page", 1))
    page_size = int(request.query_params.get("page_size", 20))
    start = (page - 1) * page_size
    end = start + page_size
    # Expéditeurs uniques pour filtre
    shared_by_list = list(set(f["shared_by"] for f in data if f["shared_by"]))
    return Response({
        "results": data[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
        "shared_by_list": shared_by_list,
    })


PERMISSIONS_LABELS = {
    "can_read": "Lecture",
    "can_write": "Ajout de fichiers",
    "can_update": "Renommage de fichiers",
    "can_delete": "Suppression de fichiers",
    "can_delete_folder": "Suppression du dossier",
}

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_share_permission(request, share_id):
    try:
        share = FolderShare.objects.get(id=share_id)
    except FolderShare.DoesNotExist:
        return Response({"error": "Partage introuvable"}, status=status.HTTP_404_NOT_FOUND)

    if request.user != share.folder.proprietaire:
        return Response(
            {"error": "⛔ Vous n etes pas autorise a modifier ce partage."},
            status=status.HTTP_403_FORBIDDEN
        )

    data = request.data
    updated_fields = []
    for field in ["can_read", "can_write", "can_update", "can_delete", "can_delete_folder"]:
        if field in data:
            setattr(share, field, data[field])
            updated_fields.append(field)
    share.save()

    # Notification et message précis
    if updated_fields:
        labels = [PERMISSIONS_LABELS.get(f, f) for f in updated_fields]
        Notification.objects.create(
            user=share.user,
            type="permission",
            message=f"Permission(s) mise(s) à jour pour le dossier « {share.folder.nom} » "
                    f"par {request.user.username} : {', '.join(labels)}"
        )

        user_name = share.user.username
        if len(labels) == 1:
            return Response({
                "success": True,
                "message": f"Le droit « {labels[0]} » a été mis à jour pour 👤 {user_name}."
            })
        else:
            return Response({
                "success": True,
                "message": f"Les droits {', '.join(labels)} ont été mis à jour pour 👤 {user_name}."
            })

    return Response({"success": True, "message": "Aucune permission modifiée."})

# ARCHIVES (Création, Liste, Téléchargement, Suppression)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_archives(request):
    """
    Liste toutes les archives actives de l'utilisateur connecté.
    """
    archives = Archive.objects.filter(owner=request.user, is_active=True)
    serializer = ArchiveSerializer(archives, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def create_archive(request, folder_id):
    """
    Archive un dossier existant au format .zip ou .rar,
    avec gestion propre des erreurs, taille dynamique et sécurité renforcée.
    """
    # Vérification du dossier
    try:
        folder = Folder.objects.get(id=folder_id)
    except Folder.DoesNotExist:
        return Response(
            {'error': "📁 Le dossier demande n existe pas."},
            status=status.HTTP_404_NOT_FOUND
        )

    # Vérification des permissions
    if not (
        folder.proprietaire == request.user or
        has_folder_permission(request.user, folder, "write") or
        has_folder_permission(request.user, folder, "update")
    ):
        return Response(
            {'error': "⛔ Vous n avez pas les droits necessaires pour archiver ce dossier."},
            status=status.HTTP_403_FORBIDDEN
        )

    # Lecture des paramètres
    archive_format = request.data.get("format", "zip").lower()
    new_name = request.data.get("new_name", None)

    if archive_format not in ["zip", "rar"]:
        return Response(
            {'error': "Format archive invalide. Utilisez zip ou rar."},
            status=status.HTTP_400_BAD_REQUEST
        )

    folder_display_name = new_name if new_name else folder.nom
    folder_name = f"{folder.id}_{safe_folder_name(folder.nom)}"
    folder_path = os.path.join(settings.MEDIA_ROOT, "uploads", folder_name)

    if not os.path.exists(folder_path):
        os.makedirs(folder_path, exist_ok=True)

    # Variables de travail
    archive = None
    archive_dir = os.path.join(settings.MEDIA_ROOT, "archives")
    os.makedirs(archive_dir, exist_ok=True)
    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    archive_filename = f"{safe_folder_name(folder_display_name)}_{timestamp}.{archive_format}"
    archive_path = os.path.join(archive_dir, archive_filename)

    try:
        # Création réelle de l'archive
        if archive_format == "zip":
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for root, _, files in os.walk(folder_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        relative_path = os.path.relpath(file_path, folder_path)
                        zipf.write(file_path, relative_path)

        elif archive_format == "rar":
            rar_binary = "/usr/bin/rar"

            if not os.path.isfile(rar_binary):
                return Response(
                    {"error": "Le binaire 'rar' est introuvable à /usr/bin/rar. Installez-le via 'sudo apt install rar'."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            import subprocess
            cmd = [rar_binary, "a", "-r", "-ep1", archive_path, folder_path]

            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            if result.returncode != 0:
                logger.error(f"[RAR ERROR] {result.stderr}")
                return Response(
                    {"error": f"Erreur RAR : {result.stderr.strip()}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        # Vérification post-création
        if not os.path.exists(archive_path):
            raise Exception("Le fichier d'archive n'a pas été créé.")

        archive_size = os.path.getsize(archive_path)

        # Création de l'objet Archive
        archive = Archive.objects.create(
            owner=request.user,
            folder_name=folder_display_name,
            expires_at=timezone.now() + timezone.timedelta(days=7),
            is_active=True,
            type_archive=archive_format,
        )

        # Ouverture du fichier brut (mode binaire)
        with open(archive_path, "rb") as f:
            #django_file = File(f)
            django_file = DjangoFile(f)
            archive.file.save(os.path.basename(archive_path), django_file, save=False)
            archive.size = os.path.getsize(archive_path)
            archive.save()

        # Supprimer le fichier temporaire après la sauvegarde
        if os.path.exists(archive_path):
            os.remove(archive_path)

        logger.info(
            f"[ARCHIVE CREATED] {folder_display_name} ({archive_format.upper()}) — Taille : {archive.size / 1024:.2f} Ko")


        # Notification utilisateur
        Notification.objects.create(
            user=request.user,
            type="archive",
            message=f"📦 Le dossier « {folder_display_name} » a été archivé ({archive_format.upper()})."
        )

        logger.info(f"[ARCHIVE CREATED] {folder_display_name} ({archive_format.upper()}) — Taille : {archive_size} octets")

                # Marquer le dossier comme archivé
        folder.is_archived = True
        folder.save(update_fields=["is_archived"])

        return Response(ArchiveSerializer(archive).data, status=status.HTTP_201_CREATED)

    except Exception as e:
        # Gestion propre des erreurs
        logger.error(f"Erreur création archive ({folder.nom}): {e}")

        # Nettoyage sécurisé
        if archive and archive.file and os.path.exists(archive.file.path):
            os.remove(archive.file.path)
        elif 'archive_path' in locals() and os.path.exists(archive_path):
            os.remove(archive_path)

        AuditLog.objects.create(
        utilisateur=request.user,
        action='CREATE',
        objet=f"Archive : {folder_display_name}.{archive_format}",
        adresse_ip=request.META.get('REMOTE_ADDR')
        )
        
        return Response(
            {'error': f"⚠️ Une erreur est survenue pendant la création de l'archive : {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def download_archive(request, archive_id):
    """
    Télécharge une archive (.zip ou .rar) avec Content-Type et Content-Disposition corrects.
    """
    import mimetypes

    try:
        archive = Archive.objects.get(id=archive_id, owner=request.user, is_active=True)
    except Archive.DoesNotExist:
        return Response({'error': 'Archive introuvable.'}, status=status.HTTP_404_NOT_FOUND)

    archive_path = archive.file.path
    if not os.path.exists(archive_path):
        return Response({'error': "Fichier d'archive manquant."}, status=status.HTTP_404_NOT_FOUND)

    # Détection correcte du type MIME
    mime_type, _ = mimetypes.guess_type(archive_path)
    if not mime_type:
        if archive_path.endswith(".rar"):
            mime_type = "application/vnd.rar"
        else:
            mime_type = "application/zip"

    file_name = os.path.basename(archive_path)
    logger.info(f"[DOWNLOAD] Archive demandée : {file_name} ({mime_type})")

    response = FileResponse(open(archive_path, "rb"), content_type=mime_type)
    response["Content-Disposition"] = f'attachment; filename="{file_name}"'
    response["Content-Length"] = os.path.getsize(archive_path)

    # Log dans la console pour diagnostic
    logger.info(f"[DOWNLOAD] Téléchargement envoyé : {file_name}, MIME={mime_type}, Taille={os.path.getsize(archive_path)} octets")

    AuditLog.objects.create(
        utilisateur=request.user,
        action='DOWNLOAD',
        objet=f"Archive : {file_name}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    return response


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def delete_archive(request, archive_id):
    """
    Supprime une archive (fichier et base).
    """
    try:
        archive = Archive.objects.get(id=archive_id, owner=request.user)
    except Archive.DoesNotExist:
        return Response({'error': 'Archive introuvable.'}, status=status.HTTP_404_NOT_FOUND)

    if archive.file and os.path.exists(archive.file.path):
        os.remove(archive.file.path)

    archive.delete()

    # Notification de suppression
    Notification.objects.create(
        user=request.user,
        type="archive",
        message=f"L'archive du dossier « {archive.folder_name} » a été supprimée."
    )

    AuditLog.objects.create(
    utilisateur=request.user,
    action='DELETE',
    objet=f"Archive : {archive.folder_name}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response({'success': 'Archive supprimée avec succès.'})

# ARCHIVE SHARING (Partage d'archive) 
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def share_archive(request, archive_id):
    """
    Partage une archive avec un ou plusieurs utilisateurs.
    Format attendu :
    [
        { "user_id": 2 },
        { "user_id": 5 }
    ]
    """
    try:
        archive = Archive.objects.get(id=archive_id, owner=request.user)
    except Archive.DoesNotExist:
        return Response({'error': "Archive introuvable ou non autorisée."},
                        status=status.HTTP_404_NOT_FOUND)

    payload = request.data
    if not isinstance(payload, list):
        return Response({'error': "Format attendu : liste d'utilisateurs."},
                        status=status.HTTP_400_BAD_REQUEST)

    shared_users = []
    for entry in payload:
        user_id = entry.get("user_id")
        if not user_id:
            continue
        try:
            user = Utilisateur.objects.get(id=user_id)
        except Utilisateur.DoesNotExist:
            continue

        Notification.objects.create(
            user=user,
            type="archive_share",
            message=f"Nouvelle archive partagée : « {archive.folder_name} » par {request.user.username}"
        )
        shared_users.append(user.username)

    if not shared_users:
        return Response({'error': "Aucun utilisateur valide trouvé."},
                        status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'success': f"Archive partagée avec : {', '.join(shared_users)}."
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def unarchive_folder(request, archive_id):
    """
     Désarchive un dossier lié à une archive et le réaffiche dans la sidebar.
    """
    try:
        archive = Archive.objects.get(id=archive_id, owner=request.user)
    except Archive.DoesNotExist:
        return Response({'error': 'Archive introuvable.'}, status=status.HTTP_404_NOT_FOUND)

    folder = Folder.objects.filter(nom=archive.folder_name, proprietaire=request.user).first()
    if not folder:
        return Response({'error': "Dossier d'origine introuvable."}, status=status.HTTP_404_NOT_FOUND)

    folder.is_archived = False
    folder.save(update_fields=["is_archived"])

    # Supprimer l'archive correspondante
    if archive.file and os.path.exists(archive.file.path):
        os.remove(archive.file.path)
    archive.delete()

    # Notification utilisateur
    Notification.objects.create(
        user=request.user,
        type="archive",
        message=f"Le dossier « {folder.nom} » a été désarchivé avec succès."
    )

    return Response({'success': f"Dossier « {folder.nom} » restauré."}, status=status.HTTP_200_OK)

# GESTION DES NOTIFICATIONS
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def create_notification(request):
    """
    Crée une notification personnalisée envoyée à tous les destinataires du dossier supprimé
    ou à un utilisateur spécifique.
    Exemple de payload attendu :
    {
        "type": "info",
        "message": "Le dossier X a été supprimé par Y.",
        "recipients": [1, 2, 3]  # (optionnel)
    }
    """
    notif_type = request.data.get("type", "info")
    message = request.data.get("message")
    recipients = request.data.get("recipients", None)

    if not message:
        return Response({"error": "Message requis."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Si recipients est fourni → envoyer à chaque utilisateur ciblé
        if isinstance(recipients, list) and len(recipients) > 0:
            users = Utilisateur.objects.filter(id__in=recipients)
            for user in users:
                Notification.objects.create(user=user, type=notif_type, message=message)
            logger.info(f"[NOTIF] Notification personnalisée envoyée à {len(users)} utilisateur(s).")
        else:
            # Sinon, notification uniquement pour l'émetteur
            Notification.objects.create(user=request.user, type=notif_type, message=message)
            logger.info(f"[NOTIF] Notification enregistrée pour {request.user.username}.")

        return Response(
            {"success": True, "message": "Notification créée avec succès."},
            status=status.HTTP_201_CREATED
        )

    except Exception as e:
        logger.error(f"[NOTIF ERROR] Erreur lors de la création : {e}")
        return Response(
            {"error": f"Erreur interne : {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_notifications(request):
    # Conservation des notifications pendant 48 heures
    since = timezone.now() - timezone.timedelta(hours=48)
    qs = Notification.objects.filter(user=request.user, created_at__gte=since).order_by("-created_at")

    # Filtres
    notif_type = request.GET.get('type', '')
    search = request.GET.get('search', '')
    days = request.GET.get('days', '')

    if notif_type:
        qs = qs.filter(type=notif_type)
    if search:
        qs = qs.filter(message__icontains=search)
    if days:
        try:
            from datetime import timedelta
            qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=int(days)))
        except ValueError:
            pass

    # Pagination
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 20))
    total = qs.count()
    start = (page - 1) * page_size
    end = start + page_size
    notifs = qs[start:end]

    serializer = NotificationSerializer(notifs, many=True)
    return Response({
        'results': serializer.data,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size,
    })


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def clear_notifications(request):
    """
    Supprime toutes les notifications de l'utilisateur avant l'expiration automatique (24h).
    """
    count = Notification.objects.filter(user=request.user).count()
    Notification.objects.filter(user=request.user).delete()
    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Notifications effacées : {count} notification(s) supprimées",
        adresse_ip=request.META.get('REMOTE_ADDR', '')
    )
    return Response({'success': f'{count} notification(s) effacée(s).'})


# Supprimer une notification précise
@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_notification(request, pk):
    try:
        notif = Notification.objects.get(pk=pk, user=request.user)
        msg = notif.message[:200]
        notif.delete()
        AuditLog.objects.create(
            utilisateur=request.user,
            action='DELETE',
            objet=f"Notification supprimée : {msg}",
            adresse_ip=request.META.get('REMOTE_ADDR', '')
        )
        return Response({"success": "Notification supprimée."}, status=status.HTTP_204_NO_CONTENT)
    except Notification.DoesNotExist:
        return Response({"error": "Notification introuvable."}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def mark_notifications_read(request):
    """
    Marque toutes les notifications de l'utilisateur comme lues (mais ne supprime pas).
    """
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response({'success': 'Toutes les notifications ont été marquées comme lues.'})

@api_view(["DELETE"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def delete_all_archives(request):
    archives = Archive.objects.filter(owner=request.user, is_active=True)
    count = archives.count()
    for archive in archives:
        try:
            if archive.file and os.path.exists(archive.file.path):
                os.remove(archive.file.path)
        except Exception as e:
            logger.error(f'Erreur suppression fichier archive {archive.id}: {e}')
    archives.delete()
    AuditLog.objects.create(
        utilisateur=Utilisateur.objects.get(username=request.user.username),
        action='DELETE',
        objet=f'{count} archive(s) supprimée(s) manuellement',
        details='Suppression manuelle via bouton Tout effacer archives',
    )
    return Response({'message': f'{count} archive(s) supprimée(s).'}, status=status.HTTP_200_OK)

@api_view(["POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def bulk_create_archive(request):
    folder_ids = request.data.get("folder_ids", [])
    archive_format = request.data.get("format", "zip").lower()

    if not folder_ids:
        return Response({"error": "Aucun dossier selectionne."}, status=status.HTTP_400_BAD_REQUEST)

    if archive_format not in ["zip", "rar"]:
        return Response({"error": "Format invalide."}, status=status.HTTP_400_BAD_REQUEST)

    results = []
    errors = []

    for folder_id in folder_ids:
        try:
            folder = Folder.objects.get(id=folder_id)

            if not (folder.proprietaire == request.user or
                has_folder_permission(request.user, folder, "write")):
                errors.append(f"{folder.nom}: permission refusee")
                continue

            folder_name = f"{folder.id}_{safe_folder_name(folder.nom)}"
            folder_path = os.path.join(settings.MEDIA_ROOT, "uploads", folder_name)

            if not os.path.exists(folder_path):
                os.makedirs(folder_path, exist_ok=True)

            archive_dir = os.path.join(settings.MEDIA_ROOT, "archives")
            os.makedirs(archive_dir, exist_ok=True)

            timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
            archive_filename = f"{safe_folder_name(folder.nom)}_{timestamp}.{archive_format}"
            archive_path = os.path.join(archive_dir, archive_filename)

            if archive_format == "zip":
                with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                    for f in FileModel.objects.filter(folder=folder):
                        if f.fichier and os.path.exists(f.fichier.path):
                            zipf.write(f.fichier.path, f.nom)

            elif archive_format == "rar":
                rar_binary = "/usr/bin/rar"
                if not os.path.isfile(rar_binary):
                    errors.append(f"{folder.nom}: binaire RAR introuvable")
                    continue

                import subprocess
                cmd = [rar_binary, "a", "-r", "-ep1", archive_path, folder_path]
                subprocess.run(cmd, check=True)

            archive = Archive.objects.create(
                owner=request.user,
                folder_name=folder.nom,
                expires_at=timezone.now() + timezone.timedelta(days=7),
                is_active=True,
                type_archive=archive_format,
            )

            with open(archive_path, "rb") as f:
                archive.file.save(os.path.basename(archive_path), DjangoFile(f), save=False)
                archive.size = os.path.getsize(archive_path)
                archive.save()

            if os.path.exists(archive_path):
                os.remove(archive_path)

            folder.is_archived = True
            folder.save(update_fields=["is_archived"])
            Notification.objects.create(
                user=request.user,
                type='archive',
                message=f'Le dossier « {folder.nom} » a été archivé ({archive_format.upper()}).'
            )
            results.append(folder.nom)

        except Exception as e:
            errors.append(f"{folder_id}: {str(e)}")

    return Response({
        "created": len(results),
        "folders": results,
        "errors": errors
    }, status=status.HTTP_201_CREATED)

@api_view(["POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def leave_folder(request, folder_id):
    try:
        share = FolderShare.objects.get(folder_id=folder_id, user=request.user)
    except FolderShare.DoesNotExist:
        return Response({"error": "Partage introuvable."}, status=status.HTTP_404_NOT_FOUND)
    folder_name = share.folder.nom
    owner_username = share.folder.proprietaire.username if share.folder.proprietaire else '—'
    share.delete()
    try:
        utilisateur = Utilisateur.objects.get(username=request.user.username)
        AuditLog.objects.create(
            utilisateur=utilisateur,
            action="DELETE",
            objet=f"Quitter dossier partage : {folder_name}",
            details=f"Dossier appartenant a {owner_username}",
        )
    except Exception:
        pass
    Notification.objects.create(
        user=share.folder.proprietaire,
        type="info",
        message=f"{request.user.username} a quitté le dossier partagé {folder_name}.",
    )
    return Response({"message": f"Vous avez quitté le dossier {folder_name}."}, status=status.HTTP_200_OK)

@api_view(["DELETE"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def revoke_share(request, share_id):
    try:
        share = FolderShare.objects.select_related("folder", "user").get(id=share_id)
    except FolderShare.DoesNotExist:
        return Response({"error": "Partage introuvable."}, status=status.HTTP_404_NOT_FOUND)
    if share.folder.proprietaire != request.user:
        return Response({"error": "Non autorise."}, status=status.HTTP_403_FORBIDDEN)
    username = share.user.username
    folder_name = share.folder.nom
    Notification.objects.create(
        user=share.user,
        type="info",
        message=f"Votre accès au dossier {folder_name} a été révoqué par {request.user.username}."
    )
    try:
        utilisateur = Utilisateur.objects.get(username=request.user.username)
        AuditLog.objects.create(
            utilisateur=utilisateur,
            action="DELETE",
            objet=f"Revocation partage : {folder_name} pour {username}",
            details=f"Révocation manuelle par le propriétaire",
        )
    except Exception:
        pass
    share.delete()
    return Response({"message": f"Accès de {username} révoqué."}, status=status.HTTP_200_OK)

@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser | IsSuperAdmin])
def list_audit_deletions(request):
    """Liste toutes les suppressions du journal — visible uniquement aux admins"""
    # Masquer les suppressions du super_admin aux admins normaux
    if hasattr(request.user, 'role') and request.user.role != 'super_admin':
        deletions = AuditLogDeletion.objects.select_related("admin").exclude(admin__role='super_admin')
    else:
        deletions = AuditLogDeletion.objects.select_related("admin").all()
    data = [{
        "id": d.id,
        "admin": d.admin.username if d.admin else "inconnu",
        "deleted_log_id": d.deleted_log_id,
        "deleted_utilisateur": d.deleted_utilisateur,
        "deleted_action": d.deleted_action,
        "deleted_objet": d.deleted_objet,
        "deleted_at": d.deleted_at,
        "adresse_ip": d.adresse_ip,
    } for d in deletions]
    return Response(data)

@api_view(["DELETE"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsSuperAdmin])
def clear_audit_deletions(request):
    """Nettoyer toutes les suppressions du journal — super_admin uniquement"""
    count = AuditLogDeletion.objects.count()
    AuditLogDeletion.objects.all().delete()
    return Response({"message": f"{count} suppression(s) effacee(s)."}, status=status.HTTP_200_OK)

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Invalide le token — déconnecte tous les appareils"""
    try:
        request.user.auth_token.delete()
    except Exception:
        pass
    return Response({'success': 'Deconnecte.'})
