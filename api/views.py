import os, hashlib, shutil, logging, re, csv, zipfile, mimetypes
from django.db.models import Count
from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
from django.core.mail import send_mail
from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited
from django.core.files import File as DjangoFile
from django.utils.crypto import get_random_string
from django.http import HttpResponse, FileResponse
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from .permissions import IsCustomAdminUser, IsSuperAdmin
from .models import File as FileModel, Folder, Service, FolderShare, Utilisateur, Notification, Archive, AuditLog, AuditLogDeletion
from .serializers import FileSerializer, FolderSerializer, ServiceSerializer, NotificationSerializer, ArchiveSerializer

logger = logging.getLogger(__name__)
Utilisateur = get_user_model()

##### HELPER PERMISSIONS #####
def has_folder_permission(user, folder, action: str) -> bool:
    """ Vérifie si un utilisateur a les droits nécessaires sur un dossier via FolderShare """
    if user == folder.proprietaire:
        return True

    share = FolderShare.objects.filter(folder=folder, user=user).first()
    if not share:
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

##### PAGE ACCUEIL #####
def home(request):
    return HttpResponse("Bienvenue sur l'API de centralisation des données !")

##### AUTHENTIFICATION & UTILISATEURS #####
@api_view(['POST'])
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
L'équipe DMT — Doumbia Moussa Transport
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

    utilisateur.username = username
    utilisateur.email = email
    utilisateur.service = service
    utilisateur.save()

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
        return Response({'error': 'Utilisateur non trouve.'}, status=status.HTTP_404_NOT_FOUND)

    # Seul is_superuser peut supprimer un super_admin
    if utilisateur.role == 'super_admin' and not request.user.is_superuser:
        return Response({'error': 'Seul le concepteur peut supprimer un super administrateur.'}, status=status.HTTP_403_FORBIDDEN)

    nom = utilisateur.username
    utilisateur.delete()

    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Suppression utilisateur : {nom}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({'success': 'Utilisateur supprimé.'})


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


##### FICHIERS CENTRALISÉS #####
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


##### HISTORIQUE (AuditLog) #####
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
                "Cette action est enregistrée dans l'onglet Suppressions de l'AdminPanel.\n\n"
                "Cordialement,\nLe système DMT — Doumbia Moussa Transport"
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
                "Cette action est enregistrée dans l'onglet Suppressions de l'AdminPanel.\n\n"
                "Si suspecte, contactez le Super Administrateur.\n\n"
                "Cordialement,\nLe système DMT — Doumbia Moussa Transport"
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
    return Response({'success': 'Entree supprimee.'})


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

    # Journal
    total_logs = AuditLog.objects.count()
    today = now().date()
    today_logs = AuditLog.objects.filter(timestamp__date=today).count()
    last_log = AuditLog.objects.order_by('-timestamp').first()

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
        }
    })

##### FOLDERS CRUD #####
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
        is_archived=False
    ).prefetch_related("shares__user")

    shared = Folder.objects.filter(
        shares__user=request.user
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

    if os.path.exists(folder_path):
        shutil.rmtree(folder_path)
        
    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Dossier : {folder.nom}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    folder.delete()
    return Response({'success': 'Dossier supprimé avec son contenu'})


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def share_folder(request, folder_id):
    try:
        folder = Folder.objects.get(id=folder_id, proprietaire=request.user)
    except Folder.DoesNotExist:
        return Response({'error': 'Dossier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

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

    # Mise à jour en base
    file_obj.nom = new_name
    file_obj.save(update_fields=["nom", "updated_at"])

    logger.info(f"[RENAME] Fichier renommé en '{new_name}' par {request.user.username}")
    
    AuditLog.objects.create(
    utilisateur=request.user,
    action='UPDATE',
    objet=f"Fichier renommé : {new_name}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response(FileSerializer(file_obj, context={"request": request}).data)


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

    if file_obj.fichier and os.path.exists(file_obj.fichier.path):
        os.remove(file_obj.fichier.path)

    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Fichier : {file_obj.nom}",
        adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    file_obj.delete()
    logger.info(f"[DELETE] Fichier '{file_obj.nom}' supprimé par {request.user.username}")
    return Response({'success': 'Fichier supprimé'})

##### FILE PREVIEW #####
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

    # === URL sécurisée avec token + cache-busting ===
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
            "shared_by": file.folder.proprietaire.username,
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
            message=f"🔧 Permission(s) mise(s) à jour pour le dossier « {share.folder.nom} » "
                    f"par {request.user.username} : {', '.join(labels)}"
        )

        user_name = share.user.username
        if len(labels) == 1:
            return Response({
                "success": True,
                "message": f"✅ Le droit « {labels[0]} » a été mis à jour pour 👤 {user_name}."
            })
        else:
            return Response({
                "success": True,
                "message": f"✅ Les droits {', '.join(labels)} ont été mis à jour pour 👤 {user_name}."
            })

    return Response({"success": True, "message": "✅ Aucune permission modifiée."})

##### ARCHIVES (Création, Liste, Téléchargement, Suppression) #####
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

##### ARCHIVE SHARING (Partage d'archive) #####
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
            message=f"📦 Nouvelle archive partagée : « {archive.folder_name} » par {request.user.username}"
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
    ♻️ Désarchive un dossier lié à une archive et le réaffiche dans la sidebar.
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
        message=f"♻️ Le dossier « {folder.nom} » a été désarchivé avec succès."
    )

    return Response({'success': f"Dossier « {folder.nom} » restauré."}, status=status.HTTP_200_OK)

##### GESTION DES NOTIFICATIONS #####
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
        "message": "🗑️ Le dossier X a été supprimé par Y.",
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
    notifs = Notification.objects.filter(user=request.user, created_at__gte=since).order_by("-created_at")
    return Response(NotificationSerializer(notifs, many=True).data)



@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def clear_notifications(request):
    """
    Supprime toutes les notifications de l'utilisateur avant l'expiration automatique (24h).
    """
    Notification.objects.filter(user=request.user).delete()
    return Response({'success': 'Toutes les notifications ont été supprimées.'})


# Supprimer une notification précise
@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_notification(request, pk):
    try:
        notif = Notification.objects.get(pk=pk, user=request.user)
        notif.delete()
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
                message=f'📦 Le dossier « {folder.nom} » a été archivé ({archive_format.upper()}).'
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
    owner_username = share.folder.proprietaire.username
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
        message=f"Votre acces au dossier {folder_name} a ete revoque par {request.user.username}."
    )
    try:
        utilisateur = Utilisateur.objects.get(username=request.user.username)
        AuditLog.objects.create(
            utilisateur=utilisateur,
            action="DELETE",
            objet=f"Revocation partage : {folder_name} pour {username}",
            details=f"Revocation manuelle par le proprietaire",
        )
    except Exception:
        pass
    share.delete()
    return Response({"message": f"Acces de {username} revoque."}, status=status.HTTP_200_OK)

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
