from rest_framework.authtoken.views import obtain_auth_token
from django.urls import path
from . import views

urlpatterns = [
    # AUTH
    path('login/', views.login_view, name='login'),
    path('token/', obtain_auth_token, name='api_token_auth'),
    path('user/', views.get_user_view, name='get_user'),

    # USERS
    path('utilisateurs/', views.get_all_users, name='get_all_users'),
    path('utilisateurs/creer/', views.create_user_account, name='create_user_account'),
    path('utilisateurs/<int:user_id>/role/', views.update_user_role, name='update_user_role'),
    path('utilisateurs/<int:user_id>/reset_password/', views.reset_user_password, name='reset_user_password'),
    path('utilisateurs/<int:user_id>/update/', views.update_user_account, name='update_user_account'),
    path('utilisateurs/<int:user_id>/delete/', views.delete_user_account, name='delete_user_account'),
    path('utilisateurs/<int:user_id>/toggle-active/', views.toggle_user_active, name='toggle_user_active'),
    path('users/', views.list_users_for_sharing, name='list_users_for_sharing'),  # API employé
    path('update_password/', views.update_password_view, name='update_password'),
    path('last-seen/', views.update_last_seen, name='update_last_seen'),

    # HISTORIQUE
    path('historique/', views.get_historique, name='get_historique'),
    path('historique/export-csv/', views.export_historique_csv, name='export_historique_csv'),
    path('historique/<int:log_id>/', views.delete_historique, name='delete_historique'),
    path('historique/clear/', views.delete_all_historique, name='delete_all_historique'),

    # FICHIERS CENTRALISÉS (admin)
    path('synchroniser_fichiers/', views.synchroniser_fichiers, name='synchroniser_fichiers'),
    path('centralized-files/', views.list_centralized_files, name='list_centralized_files'),
    path('disk-usage/', views.get_disk_usage, name='get_disk_usage'),
    path('centralized-files/<int:file_id>/update/', views.update_centralized_file, name='update_centralized_file'),
    path('centralized-files/<int:file_id>/delete/', views.delete_centralized_file, name='delete_centralized_file'),
    path('centralized-files/<int:file_id>/check-shared/', views.check_file_shared, name='check_file_shared'),
    

    # SERVICES
    path('services/', views.list_services, name='list_services'),
    path('services/create/', views.create_service, name='create_service'),
    path('services/<int:service_id>/delete/', views.delete_service, name='delete_service'),
    path('services/<int:service_id>/update/', views.update_service, name='update_service'),
    path('dashboard-stats/', views.get_dashboard_stats, name='dashboard_stats'),

   # FOLDERS
    path('folders/', views.list_folders, name='list_folders'),
    path('folders/create/', views.create_folder, name='create_folder'),
    path('folders/<int:parent_id>/subfolders/', views.create_subfolder, name='create_subfolder'),
    path('folders/<int:folder_id>/rename/', views.rename_folder, name='rename_folder'),
    path('folders/<int:folder_id>/delete/', views.delete_folder, name='delete_folder'),
    path('folders/<int:folder_id>/share/', views.share_folder, name='share_folder'),
    


    # FILES CRUD
    path('folders/<int:folder_id>/upload/', views.upload_file, name='upload_file'),
    path('folders/<int:folder_id>/files/', views.list_files_by_folder, name='list_files_by_folder'),
    path('files/<int:file_id>/rename/', views.rename_file, name='rename_file'),
    path('files/<int:file_id>/delete/', views.delete_file, name='delete_file'),

    # FILE PREVIEW
    path('files/<int:file_id>/preview/', views.preview_file, name='preview_file'),
    path('files/<int:file_id>/view/', views.view_file, name='view_file'),

    # FILE SHARED
    path('shared-files/', views.list_shared_files, name='list_shared_files'),

    # Mettre à jour les permissions
    path("shares/<int:share_id>/", views.update_share_permission, name="update_share_permission"),

    # ARCHIVES
    path('archives/', views.list_archives, name='list_archives'),
    path('archives/<int:folder_id>/create/', views.create_archive, name='create_archive'),
    path('archives/<int:archive_id>/download/', views.download_archive, name='download_archive'),
    path('archives/<int:archive_id>/delete/', views.delete_archive, name='delete_archive'),
    path('archives/<int:archive_id>/unarchive/', views.unarchive_folder, name='unarchive_folder'),
    path("archives/<int:archive_id>/share/", views.share_archive, name="share_archive"),
    path("archives/delete-all/", views.delete_all_archives, name="delete_all_archives"),

    
    # Notifications
    path('notifications/create/', views.create_notification, name='create_notification'),
    path('notifications/', views.list_notifications, name='list_notifications'),
    path('notifications/mark_read/', views.mark_notifications_read, name='mark_notifications_read'),
    path('notifications/clear/', views.clear_notifications, name='clear_notifications'),
    path('notifications/<int:pk>/', views.delete_notification, name='delete_notification'),


]
