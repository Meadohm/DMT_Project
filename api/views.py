import os, hashlib, shutil, logging, re, csv, zipfile, mimetypes
from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
from django.core.mail import send_mail
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
from .permissions import IsCustomAdminUser
from .models import File as FileModel, Folder, Service, FolderShare, Utilisateur, Notification, Archive, AuditLog
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

    # Lecture autorisée par défaut si l’utilisateur a accès au partage
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
    """ Nettoie un nom de dossier pour l’OS """
    return re.sub(r'[^a-zA-Z0-9_-]', '_', name)

##### PAGE ACCUEIL #####
def home(request):
    return HttpResponse("Bienvenue sur l'API de centralisation des données !")

##### AUTHENTIFICATION & UTILISATEURS #####
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if not user:
        return Response({'error': 'Nom d’utilisateur ou mot de passe incorrect'}, status=status.HTTP_400_BAD_REQUEST)
    token, _ = Token.objects.get_or_create(user=user)
    
    AuditLog.objects.create(
    utilisateur=user,
    action='LOGIN',
    objet='Système',
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response({'token': token.key, 'role': user.role}, status=status.HTTP_200_OK)

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
    })

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser])
def get_all_users(request):
    utilisateurs = Utilisateur.objects.all().only("id", "username", "email", "role", "service")
    data = [
        {
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.role,
            'service': u.service,
        }
        for u in utilisateurs
    ]
    return Response(data)

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_users_for_sharing(request):
    utilisateurs = Utilisateur.objects.only("id", "username", "role", "service", "avatar")
    data = [
        {
            'id': u.id,
            'username': u.username,
            'role': u.role,
            'service': u.service,
            'avatar': u.avatar.url if u.avatar else None,
        }
        for u in utilisateurs if u.id != request.user.id
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
        return Response({'error': 'Le nouveau mot de passe doit être différent de l’ancien.'},
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
@permission_classes([IsAdminUser | IsCustomAdminUser])
def update_user_role(request, user_id):
    try:
        utilisateur = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    new_role = request.data.get('role', '').lower()
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
@permission_classes([IsAdminUser | IsCustomAdminUser])
def reset_user_password(request, user_id):
    try:
        utilisateur = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    nouveau_mot_de_passe = get_random_string(length=8)
    utilisateur.set_password(nouveau_mot_de_passe)
    utilisateur.save()

    send_mail(
        subject='Réinitialisation de mot de passe',
        message=f'Bonjour {utilisateur.username}, votre nouveau mot de passe est : {nouveau_mot_de_passe}',
        from_email='admin@centralisation.com',
        recipient_list=[utilisateur.email],
        fail_silently=True,
    )

    AuditLog.objects.create(
    utilisateur=request.user,
    action='UPDATE',
    objet=f"Réinitialisation mot de passe : {utilisateur.username}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response({'success': 'Mot de passe réinitialisé et envoyé par email.'})

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser])
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

    return Response({'success': 'Utilisateur créé.', 'id': user.id}, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser])
def delete_user_account(request, user_id):
    if request.user.id == user_id:
        return Response({'error': 'Vous ne pouvez pas supprimer votre propre compte.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        utilisateur = Utilisateur.objects.get(id=user_id)
    except Utilisateur.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

    nom = utilisateur.username
    utilisateur.delete()

    AuditLog.objects.create(
        utilisateur=request.user,
        action='DELETE',
        objet=f"Suppression utilisateur : {nom}",
        adresse_ip=request.META.get('REMOTE_ADDR'),
    )

    return Response({'success': 'Utilisateur supprimé.'})


##### HISTORIQUE (AuditLog) #####
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser])
def get_historique(request):
    logs = AuditLog.objects.select_related('utilisateur').all()
    data = [
        {
            'id': log.id,
            'fichier': log.objet,
            'action': log.get_action_display(),
            'date': log.timestamp.strftime('%d/%m/%Y %H:%M'),
            'utilisateur': log.utilisateur.username if log.utilisateur else '—',
        }
        for log in logs
    ]
    return Response(data)


@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser | IsCustomAdminUser])
def delete_historique(request, log_id):
    try:
        log = AuditLog.objects.get(id=log_id)
    except AuditLog.DoesNotExist:
        return Response({'error': 'Entrée non trouvée.'}, status=status.HTTP_404_NOT_FOUND)

    log.delete()
    return Response({'success': 'Entrée supprimée.'})


##### SERVICES #####
@api_view(['POST'])
@permission_classes([IsAdminUser])
def create_service(request):
    serializer = ServiceSerializer(data=request.data)
    if serializer.is_valid():
        service = serializer.save()
        os.makedirs(os.path.join(settings.MEDIA_ROOT, 'soumissions', service.nom), exist_ok=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def list_services(request):
    services = Service.objects.all()
    return Response(ServiceSerializer(services, many=True).data)


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def delete_service(request, service_id):
    try:
        Service.objects.get(id=service_id).delete()
        return Response({'success': 'Service supprimé'})
    except Service.DoesNotExist:
        return Response({'error': 'Service non trouvé'}, status=status.HTTP_404_NOT_FOUND)

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
        return Response({'error': '⛔ Vous n’avez pas la permission de créer un sous-dossier ici.'},
                        status=status.HTTP_403_FORBIDDEN)

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
            {'error': 'Format attendu : liste d’utilisateurs avec permissions.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Supprimer les partages existants avant de recréer
    FolderShare.objects.filter(folder=folder).delete()

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

        # Créer une notification adaptée
        if created:
            Notification.objects.create(
                user=user,
                type="share",
                message=f"📂 Nouveau dossier partagé par {request.user.username} : {folder.nom}"
            )

        else:
            Notification.objects.create(
                user=user,
                type="permission",
                message=f"Permissions mises à jour pour le dossier : {folder.nom}"
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

    # Notifier le propriétaire si ce n’est pas lui qui a uploadé
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
    return Response({"type": "unsupported", "message": "Pas d’aperçu disponible"})


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
    return Response(data)


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
            {"error": "⛔ Vous n'êtes pas autorisé à modifier ce partage."},
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
            {'error': "📁 Le dossier demandé n'existe pas."},
            status=status.HTTP_404_NOT_FOUND
        )

    # Vérification des permissions
    if not (
        folder.proprietaire == request.user or
        has_folder_permission(request.user, folder, "write") or
        has_folder_permission(request.user, folder, "update")
    ):
        return Response(
            {'error': "⛔ Vous n'avez pas les droits nécessaires pour archiver ce dossier."},
            status=status.HTTP_403_FORBIDDEN
        )

    # Lecture des paramètres
    archive_format = request.data.get("format", "zip").lower()
    new_name = request.data.get("new_name", None)

    if archive_format not in ["zip", "rar"]:
        return Response(
            {'error': "⚠️ Format d’archive invalide. Utilisez 'zip' ou 'rar'."},
            status=status.HTTP_400_BAD_REQUEST
        )

    folder_display_name = new_name if new_name else folder.nom
    folder_name = f"{folder.id}_{safe_folder_name(folder.nom)}"
    folder_path = os.path.join(settings.MEDIA_ROOT, "uploads", folder_name)

    if not os.path.exists(folder_path):
        return Response(
            {'error': "📂 Le dossier source est introuvable sur le serveur."},
            status=status.HTTP_404_NOT_FOUND
        )

    # Variables de travail
    archive = None
    archive_dir = os.path.join(settings.MEDIA_ROOT, "archives")
    os.makedirs(archive_dir, exist_ok=True)
    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    archive_filename = f"{safe_folder_name(folder_display_name)}_{timestamp}.{archive_format}"
    archive_path = os.path.join(archive_dir, archive_filename)

    try:
        # Création réelle de l’archive
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
            raise Exception("Le fichier d’archive n’a pas été créé.")

        archive_size = os.path.getsize(archive_path)

        # Création de l’objet Archive
        archive = Archive.objects.create(
            owner=request.user,
            folder_name=folder_display_name,
            expires_at=timezone.now() + timezone.timedelta(days=7),
            is_active=True,
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
            {'error': f"⚠️ Une erreur est survenue pendant la création de l’archive : {str(e)}"},
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
        return Response({'error': 'Fichier d’archive manquant.'}, status=status.HTTP_404_NOT_FOUND)

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
        message=f"L’archive du dossier « {archive.folder_name} » a été supprimée."
    )

    AuditLog.objects.create(
    utilisateur=request.user,
    action='DELETE',
    objet=f"Archive : {archive.folder_name}",
    adresse_ip=request.META.get('REMOTE_ADDR')
    )
    
    return Response({'success': 'Archive supprimée avec succès.'})

##### ARCHIVE SHARING (Partage d’archive) #####
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
        return Response({'error': "Format attendu : liste d’utilisateurs."},
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
        return Response({'error': 'Dossier d’origine introuvable.'}, status=status.HTTP_404_NOT_FOUND)

    folder.is_archived = False
    folder.save(update_fields=["is_archived"])

    # Supprimer l’archive correspondante
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
            # Sinon, notification uniquement pour l’émetteur
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
    Supprime toutes les notifications de l’utilisateur avant l’expiration automatique (24h).
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
    Marque toutes les notifications de l’utilisateur comme lues (mais ne supprime pas).
    """
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response({'success': 'Toutes les notifications ont été marquées comme lues.'})
