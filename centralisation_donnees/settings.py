"""
Django settings for centralisation_donnees project.
"""

from pathlib import Path
import os  # nécessaire pour chemins fichiers

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-)#t+klmuu6&fn5=^8rv&$9w^ocoikj4-lw&a$7k97p(1*12rp#'
DEBUG = True
ALLOWED_HOSTS = ["192.168.56.102", "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = ["http://192.168.56.1:3000"]
# ALLOWED_HOSTS = ['*']

# ============================
# Applications
# ============================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'api',  # Mon application API
    'rest_framework',
    'rest_framework.authtoken',
    'django_cron',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  #CORS
    'django.middleware.common.CommonMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOW_ALL_ORIGINS = True

ROOT_URLCONF = 'centralisation_donnees.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'centralisation_donnees.wsgi.application'

# ============================
# Base de données (Postgres)
# ============================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'centralisation_db',
        'USER': 'osboxes',
        'PASSWORD': 'Moh2025@DMT',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

# ============================
# Auth & sécurité
# ============================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'api.Utilisateur'

# ============================
# DRF
# ============================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.BasicAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

# ============================
# Logging
# ============================
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'INFO'},
        'my_logger': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': True},
    },
}

# Autoriser l’affichage dans un <iframe>
X_FRAME_OPTIONS = 'ALLOWALL'

# Facultatif : pour désactiver les protections COOP/COEP si activées
SECURE_CROSS_ORIGIN_OPENER_POLICY = None


# ============================
# Email
# ============================
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp-mail.outlook.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'mohamed.fofana2022@esatic.edu.ci'
EMAIL_HOST_PASSWORD = 'M@hamed@2022'
DEFAULT_FROM_EMAIL = 'mohamed.fofana2022@esatic.edu.ci'

# ============================
# Media (fichiers uploadés)
# ============================
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
