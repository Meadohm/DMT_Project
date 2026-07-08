import React, { useState } from "react";

const SECTIONS = [
  {
    icon: "📋",
    title: "Vue d'ensemble du panel",
    content: `Le panel administrateur vous donne accès à toutes les fonctions de gestion de la plateforme DocFlow Pro :
- Tableau de bord : statistiques globales (utilisateurs, fichiers, stockage, activité).
- Gestion utilisateurs : créer et gérer les comptes de tous les collaborateurs.
- Gestion des services : organiser les équipes en services distincts.
- Gestion fichiers : consulter tous les fichiers uploadés sur la plateforme.
- Journal d'activité : suivre toutes les actions réalisées par les utilisateurs.
- Corbeille : restaurer ou supprimer définitivement les fichiers et dossiers supprimés.
- Mon Profil : modifier vos informations personnelles et votre mot de passe.`
  },
  {
    icon: "👥",
    title: "Gestion des utilisateurs",
    content: `Créer un compte :
Cliquez sur "+ Créer un utilisateur", remplissez le formulaire (nom, email, mot de passe, rôle, service) et confirmez. L'utilisateur reçoit automatiquement un email avec ses identifiants si un email valide est renseigné.

Modifier un compte :
Cliquez sur "Éditer" à côté de l'utilisateur. Vous pouvez modifier son nom, email et service.

Réinitialiser un mot de passe :
Cliquez sur "Réinitialiser Mdp". Un nouveau mot de passe temporaire est généré et envoyé par email.

Désactiver un compte :
Cliquez sur "⏸ Désactiver". L'utilisateur ne peut plus se connecter mais ses données sont conservées.

Supprimer un compte :
Le bouton "Supprimer" est visible uniquement pour les employés et responsables. Les comptes admins ne peuvent pas être supprimés par un admin normal.

Filtres disponibles : par rôle, par service, par statut de connexion.`
  },
  {
    icon: "🏢",
    title: "Gestion des services",
    content: `Les services permettent d'organiser les équipes (ex : Service Logistique, Service Maintenance).

Créer un service :
Cliquez sur "+ Créer un service", entrez le nom, la description, et le responsable. Confirmez.

Modifier un service :
Cliquez sur "Modifier" à côté du service concerné.

Supprimer un service :
Cliquez sur "Supprimer". Attention : cette action est irréversible. Les utilisateurs rattachés au service ne sont pas supprimés mais perdent leur rattachement.

Le nombre d'employés par service est mis à jour automatiquement.`
  },
  {
    icon: "📋",
    title: "Journal d'activité",
    content: `Le journal enregistre toutes les actions des utilisateurs : connexions, uploads, partages, suppressions, modifications.

Filtrer les logs :
Utilisez la barre de recherche par nom d'utilisateur, le filtre par type d'action, et les filtres de date début/fin.

Exporter en CSV :
Cliquez sur "⬇️ CSV" pour télécharger le journal filtré.

Supprimer une entrée :
Cliquez sur l'icône de suppression à droite de la ligne. Un email est automatiquement envoyé aux autres administrateurs pour les prévenir.

Tout effacer :
Le bouton "🗑️ Tout effacer" supprime toutes les entrées du journal. Cette action est irréversible et notifie les autres admins par email.

Note : vous ne pouvez pas supprimer vos propres entrées du journal.`
  },
  {
    icon: "🔍",
    title: "Onglet Suppressions",
    content: `L'onglet "🔍 Suppressions" dans le Journal d'activité est un registre immuable de toutes les suppressions effectuées dans le journal.

Il enregistre automatiquement :
- Qui a supprimé l'entrée (administrateur).
- Quelle entrée a été supprimée (utilisateur concerné, action, objet).
- Quand la suppression a eu lieu.
- L'adresse IP de l'administrateur.

Ce registre ne peut pas être modifié par un administrateur normal. Seul le Super Administrateur peut le nettoyer.

Export CSV disponible avec filtres par admin, action et dates.`
  },
  {
    icon: "🗑️",
    title: "Corbeille",
    content: `La corbeille conserve tous les fichiers et dossiers supprimés par les utilisateurs, en attente de restauration ou de suppression définitive.

Restaurer un ou plusieurs éléments :
Cochez les éléments à restaurer via les cases à cocher, puis cliquez sur "↩️ Restaurer la sélection (N)". Les fichiers retournent dans leur dossier d'origine. Les dossiers restaurés récupèrent automatiquement leurs sous-dossiers et fichiers.
Note : si vous restaurez un sous-dossier dont le parent est aussi en corbeille, le parent est restauré automatiquement.

Vider la corbeille :
Cliquez sur "🔥 Vider la sélection (N)" si vous avez sélectionné des éléments, ou "🔥 Vider tout (N)" pour tout supprimer. Une confirmation par email + mot de passe est requise. Cette action est irréversible et un email est envoyé à tous les administrateurs.

Alerte de volume :
Un avertissement s'affiche automatiquement quand la corbeille dépasse 10 éléments.

Sauvegarde automatique :
Un backup complet de la base de données et des fichiers media est effectué automatiquement tous les 7 jours à 2h du matin.`
  },
  {
    icon: "🔒",
    title: "Sécurité de la plateforme",
    content: `Rate limiting :
Après 5 tentatives de connexion échouées depuis la même adresse IP, l'accès est bloqué pendant 10 minutes. Cela protège contre les attaques par devinette de mot de passe.

Rôles et permissions :
- Employé : accès à ses propres dossiers et fichiers partagés.
- Responsable : accès aux dossiers de son service en plus.
- Administrateur : gestion des utilisateurs, journal, services.
- Super Administrateur : contrôle total de la plateforme.

Un administrateur normal ne peut pas modifier le rôle d'un autre administrateur ni supprimer un compte admin. Ces actions sont réservées au Super Administrateur.`
  },
  {
    icon: "📞",
    title: "Contact support",
    content: `Pour tout problème technique ou question sur la plateforme, contactez le Super Administrateur :

- Responsable plateforme : FOFANA — moh.fofana21@gmail.com

Précisez dans votre message : votre nom, la section concernée et une description précise du problème rencontré.`
  }
];

function HelpModalAdmin({ onClose }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-box" onClick={e => e.stopPropagation()}>
        <div className="help-modal-header">
          <h2>❓ Centre d'aide — Administration</h2>
          <button className="help-modal-close" onClick={onClose}>✖</button>
        </div>
        <p className="help-modal-subtitle">
          Guide complet pour administrer DocFlow Pro efficacement.
        </p>
        <div className="help-accordion">
          {SECTIONS.map((section, index) => (
            <div key={index} className={`help-accordion-item ${openIndex === index ? "open" : ""}`}>
              <button
                className="help-accordion-header"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span>{section.icon} {section.title}</span>
                <span className="help-accordion-arrow">{openIndex === index ? "▲" : "▼"}</span>
              </button>
              {openIndex === index && (
                <div className="help-accordion-content">
                  {section.content.split('\n').map((line, i) => (
                    <p key={i} style={{ margin: '4px 0' }}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HelpModalAdmin;