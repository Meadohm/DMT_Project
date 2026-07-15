# api/tests.py
"""
Tests unitaires DMT DocFlow Pro
Ordre : Authentification → Dossiers → Permissions → Upload → Partage → Suppression

VM uniquement : python manage.py test api --verbosity=2
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from api.models import Utilisateur, Folder, FolderShare, File
from api.views import has_folder_permission


# HELPERS
def create_user(username, role='employe', service='Service Test', password='Test1234!'):
    u = Utilisateur.objects.create_user(username=username, password=password)
    u.role = role
    u.service = service
    u.save()
    return u

def get_token(username, password='Test1234!'):
    """Génère un token directement en DB sans passer par la vue login (évite rate limiting)"""
    user = Utilisateur.objects.get(username=username)
    token, _ = Token.objects.get_or_create(user=user)
    return token.key

def auth_client(token):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {token}')
    return c


# 1. AUTHENTIFICATION
class TestAuthentification(TestCase):

    def setUp(self):
        self.client = APIClient()
        create_user('TESTUSER', role='employe')

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()

    def test_login_correct(self):
        """Login avec bons credentials → token + rôle retournés"""
        res = self.client.post('/api/login/', {
            'username': 'TESTUSER', 'password': 'Test1234!'
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('token', res.data)
        self.assertIn('role', res.data)

    def test_login_mauvais_mot_de_passe(self):
        """Login avec mauvais mot de passe → 401"""
        res = self.client.post('/api/login/', {
            'username': 'TESTUSER', 'password': 'mauvais'
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_login_utilisateur_inexistant(self):
        """Login avec username inexistant → 401"""
        res = self.client.post('/api/login/', {
            'username': 'FANTOME', 'password': 'Test1234!'
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_acces_sans_token(self):
        """Accès à /api/user/ sans token → 401"""
        res = self.client.get('/api/user/')
        self.assertEqual(res.status_code, 401)

    def test_acces_avec_token_invalide(self):
        """Accès avec token bidon → 401"""
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION='Token tokenbidon123')
        res = c.get('/api/user/')
        self.assertEqual(res.status_code, 401)

    def test_acces_avec_token_valide(self):
        """Accès avec token valide → 200"""
        token = get_token('TESTUSER')
        c = auth_client(token)
        res = c.get('/api/user/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['username'], 'TESTUSER')

    def test_utilisateur_desactive_bloque(self):
        """Utilisateur désactivé ne peut pas se connecter → 403"""
        u = create_user('DESACTIVE', role='employe')
        u.is_active = False
        u.save()
        res = self.client.post('/api/login/', {
            'username': 'DESACTIVE', 'password': 'Test1234!'
        }, format='json')
        self.assertIn(res.status_code, [401, 403])


# 2. PROTECTION PROPRIETAIRE
class TestProprietaireProtection(TestCase):
    """
    Règle fondamentale : propriétaire = droits complets TOUJOURS
    Personne ne peut restreindre le propriétaire sur son propre dossier
    """

    def setUp(self):
        self.proprietaire = create_user('PROPRIO', role='employe', service='Service A')
        self.autre = create_user('AUTRE', role='employe', service='Service A')
        self.responsable = create_user('RESP', role='responsable', service='Service A')
        self.admin = create_user('ADMIN', role='admin', service='Service A')

        self.dossier = Folder.objects.create(
            nom='MonDossier',
            proprietaire=self.proprietaire,
            service='Service A'
        )

    def test_proprietaire_a_tous_les_droits(self):
        """Propriétaire → True pour toutes les actions"""
        for action in ['read', 'write', 'update', 'delete_file', 'delete_folder']:
            self.assertTrue(
                has_folder_permission(self.proprietaire, self.dossier, action),
                f"Propriétaire doit avoir le droit '{action}'"
            )

    def test_autre_utilisateur_sans_partage_refuse(self):
        """Utilisateur sans partage → False pour toutes les actions sauf lecture service"""
        for action in ['write', 'update', 'delete_file', 'delete_folder']:
            self.assertFalse(
                has_folder_permission(self.autre, self.dossier, action),
                f"Utilisateur sans partage ne doit pas avoir '{action}'"
            )

    def test_responsable_ne_peut_pas_supprimer_dossier_proprietaire(self):
        """Responsable ne peut pas supprimer le dossier d'un membre de son service"""
        self.assertFalse(
            has_folder_permission(self.responsable, self.dossier, 'delete_folder'),
            "Responsable ne doit pas pouvoir supprimer le dossier d'un autre"
        )

    def test_responsable_ne_peut_pas_ecrire_dans_dossier_proprietaire(self):
        """Responsable ne peut pas écrire dans le dossier d'un membre"""
        self.assertFalse(
            has_folder_permission(self.responsable, self.dossier, 'write'),
            "Responsable ne doit pas pouvoir écrire dans le dossier d'un autre"
        )

    def test_partage_lecture_seule_ne_donne_pas_ecriture(self):
        """Partage can_read=True, can_write=False → refus écriture"""
        FolderShare.objects.create(
            folder=self.dossier,
            user=self.autre,
            can_read=True,
            can_write=False,
            can_update=False,
            can_delete=False,
            can_delete_folder=False,
        )
        self.assertTrue(has_folder_permission(self.autre, self.dossier, 'read'))
        self.assertFalse(has_folder_permission(self.autre, self.dossier, 'write'))
        self.assertFalse(has_folder_permission(self.autre, self.dossier, 'delete_file'))


# 3. PERMISSIONS RESPONSABLE
class TestResponsablePermissions(TestCase):
    """
    Responsable → lecture seule sur dossiers service par défaut
    Ne peut pas modifier/supprimer les dossiers des membres
    """

    def setUp(self):
        self.responsable = create_user('RESP2', role='responsable', service='Service B')
        self.employe = create_user('EMP', role='employe', service='Service B')
        self.autre_service = create_user('EXTERIEUR', role='employe', service='Service C')

        self.dossier_service = Folder.objects.create(
            nom='DossierService',
            proprietaire=self.employe,
            service='Service B'
        )
        self.dossier_autre_service = Folder.objects.create(
            nom='DossierAutreService',
            proprietaire=self.autre_service,
            service='Service C'
        )

    def test_responsable_lecture_dossier_son_service(self):
        """Responsable peut lire les dossiers racine de son service"""
        self.assertTrue(
            has_folder_permission(self.responsable, self.dossier_service, 'read'),
            "Responsable doit pouvoir lire les dossiers de son service"
        )

    def test_responsable_pas_ecriture_sans_partage(self):
        """Responsable ne peut pas écrire sans partage explicite"""
        self.assertFalse(
            has_folder_permission(self.responsable, self.dossier_service, 'write')
        )

    def test_responsable_pas_acces_autre_service(self):
        """Responsable ne peut pas lire les dossiers d'un autre service"""
        self.assertFalse(
            has_folder_permission(self.responsable, self.dossier_autre_service, 'read')
        )

    def test_responsable_acces_avec_partage_explicite(self):
        """Responsable avec partage explicite can_write=True → écriture autorisée"""
        FolderShare.objects.create(
            folder=self.dossier_service,
            user=self.responsable,
            can_read=True,
            can_write=True,
            can_update=True,
            can_delete=False,
            can_delete_folder=False,
        )
        self.assertTrue(has_folder_permission(self.responsable, self.dossier_service, 'write'))


# 4. CREATION DOSSIER
class TestCreationDossier(TestCase):

    def setUp(self):
        self.employe = create_user('EMP2', role='employe', service='Service D')
        self.client = APIClient()
        token = get_token('EMP2')
        self.client = auth_client(token)

    def test_creer_dossier_simple(self):
        """Employé peut créer un dossier"""
        res = self.client.post('/api/folders/create/', {'nom': 'NouveauDossier'}, format='json')
        self.assertIn(res.status_code, [200, 201])

    def test_creer_dossier_sans_authentification(self):
        """Création dossier sans token → 401"""
        c = APIClient()
        res = c.post('/api/folders/create/', {'nom': 'Dossier'}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_creer_dossier_nom_vide_refuse(self):
        """Nom de dossier vide → erreur"""
        res = self.client.post('/api/folders/create/', {'nom': ''}, format='json')
        self.assertNotIn(res.status_code, [200, 201])


# 5. PARTAGE
class TestPartage(TestCase):

    def setUp(self):
        self.proprio = create_user('PROPRIO2', role='employe', service='Service E')
        self.destinataire = create_user('DEST', role='employe', service='Service E')
        self.token = get_token('PROPRIO2')
        self.client = auth_client(self.token)
        self.dossier = Folder.objects.create(
            nom='DossierPartage',
            proprietaire=self.proprio,
            service='Service E'
        )

    def test_proprietaire_peut_partager(self):
        """Propriétaire peut partager son dossier"""
        res = self.client.post(f'/api/folders/{self.dossier.id}/share/', {
            'user_id': self.destinataire.id,
            'can_read': True,
            'can_write': False,
            'can_update': False,
            'can_delete': False,
            'can_delete_folder': False,
        }, format='json')
        self.assertIn(res.status_code, [200, 201])

    def test_non_proprietaire_ne_peut_pas_partager(self):
        """Non-propriétaire sans partage ne peut pas partager le dossier"""
        token_autre = get_token('DEST')
        c = auth_client(token_autre)
        res = c.post(f'/api/folders/{self.dossier.id}/share/', {
            'user_id': self.proprio.id,
            'can_read': True,
        }, format='json')
        self.assertIn(res.status_code, [401, 403, 404])

    def test_partage_herite_sous_dossier(self):
        """Sous-dossier hérite des permissions du parent"""
        FolderShare.objects.create(
            folder=self.dossier,
            user=self.destinataire,
            can_read=True,
            can_write=True,
            can_update=False,
            can_delete=False,
            can_delete_folder=False,
        )
        sous_dossier = Folder.objects.create(
            nom='SousDossier',
            proprietaire=self.proprio,
            service='Service E',
            parent=self.dossier
        )
        # Le sous-dossier n'a pas de FolderShare direct → héritage parent
        self.assertTrue(has_folder_permission(self.destinataire, sous_dossier, 'read'))
        self.assertTrue(has_folder_permission(self.destinataire, sous_dossier, 'write'))
        self.assertFalse(has_folder_permission(self.destinataire, sous_dossier, 'delete_folder'))


# 6. SUPPRESSION (SOFT DELETE)
class TestSuppression(TestCase):

    def setUp(self):
        self.proprio = create_user('PROPRIO3', role='employe', service='Service F')
        self.autre = create_user('AUTRE3', role='employe', service='Service F')
        self.token = get_token('PROPRIO3')
        self.client = auth_client(self.token)
        self.dossier = Folder.objects.create(
            nom='DossierASupprimer',
            proprietaire=self.proprio,
            service='Service F'
        )

    def test_proprietaire_peut_supprimer_son_dossier(self):
        """Propriétaire peut supprimer son dossier"""
        res = self.client.delete(f'/api/folders/{self.dossier.id}/delete/')
        self.assertIn(res.status_code, [200, 204])
        self.dossier.refresh_from_db()
        self.assertTrue(self.dossier.is_deleted)

    def test_soft_delete_conserve_le_dossier_en_db(self):
        """Soft delete → dossier toujours en DB avec is_deleted=True"""
        self.client.delete(f'/api/folders/{self.dossier.id}/delete/')
        self.assertTrue(Folder.objects.filter(id=self.dossier.id).exists())
        self.dossier.refresh_from_db()
        self.assertTrue(self.dossier.is_deleted)

    def test_non_proprietaire_ne_peut_pas_supprimer(self):
        """Non-propriétaire sans droits ne peut pas supprimer"""
        token_autre = get_token('AUTRE3')
        c = auth_client(token_autre)
        res = c.delete(f'/api/folders/{self.dossier.id}/delete/')
        self.assertIn(res.status_code, [401, 403, 404])
        self.dossier.refresh_from_db()
        self.assertFalse(self.dossier.is_deleted)


# 7. CONTROLE D'ACCES PAR ROLE
class TestControleAccesRole(TestCase):
    """
    Endpoints admin/superadmin inaccessibles aux employés
    """

    def setUp(self):
        self.employe = create_user('EMP3', role='employe', service='Service G')
        self.admin = create_user('ADMIN3', role='admin', service='Service G')
        self.token_emp = get_token('EMP3')
        self.token_admin = get_token('ADMIN3')

    def test_employe_ne_peut_pas_lister_tous_les_utilisateurs(self):
        """Employé ne peut pas accéder à /api/utilisateurs/"""
        c = auth_client(self.token_emp)
        res = c.get('/api/utilisateurs/')
        self.assertIn(res.status_code, [401, 403])

    def test_admin_peut_lister_les_utilisateurs(self):
        """Admin peut accéder à /api/utilisateurs/"""
        c = auth_client(self.token_admin)
        res = c.get('/api/utilisateurs/')
        self.assertIn(res.status_code, [200])

    def test_employe_ne_peut_pas_creer_un_utilisateur(self):
        """Employé ne peut pas créer un compte"""
        c = auth_client(self.token_emp)
        res = c.post('/api/utilisateurs/creer/', {
            'username': 'NOUVEAU',
            'password': 'Test1234!',
            'role': 'employe',
            'service': 'Service G'
        }, format='json')
        self.assertIn(res.status_code, [401, 403])