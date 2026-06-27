# api/permissions.py

from rest_framework.permissions import BasePermission

class IsCustomAdminUser(BasePermission):
    """
    Permission qui permet l'accès aux utilisateurs ayant le rôle 'admin'.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'admin')

class IsSuperAdmin(BasePermission):
    """Permission super_admin uniquement"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'role') and
            request.user.role == 'super_admin'
        )
