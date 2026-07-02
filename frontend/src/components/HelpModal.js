import React, { useState } from "react";

const SECTIONS = [
  {
    icon: "📋",
    title: "Démarrage rapide",
    content: `Bienvenue sur DocFlow Pro ! Voici comment bien commencer :
- Créer un dossier : cliquez sur le bouton "+" dans la barre latérale gauche. Donnez un nom à votre dossier et confirmez.
- Uploader un fichier : ouvrez un dossier, puis cliquez sur "Uploader un fichier". Vous pouvez envoyer des PDF, Word, Excel, images et vidéos.
- Retrouver un fichier : utilisez la barre de recherche en haut pour chercher par nom dans tous vos dossiers.`
  },
  {
    icon: "📁",
    title: "Gestion des dossiers",
    content: `Tout s'organise en dossiers, comme sur votre ordinateur :
- Créer un dossier : bouton "+" dans la barre latérale.
- Créer un sous-dossier : ouvrez un dossier, puis cliquez sur "Nouveau sous-dossier" (limité à 1 niveau de profondeur).
- Renommer : clic droit sur le dossier → "Renommer".
- Supprimer : clic droit sur le dossier → "Supprimer". Attention, cette action est irréversible.
- Dossiers favoris : cliquez sur l'étoile ⭐ pour épingler un dossier en haut de la liste.`
  },
  {
    icon: "📤",
    title: "Partage & permissions",
    content: `Vous pouvez partager vos dossiers avec vos collègues et choisir ce qu'ils peuvent faire :
- ✏️ Écriture : la personne peut uploader des fichiers dans votre dossier.
- 🔄 Modification : la personne peut renommer les fichiers.
- 🗑️ Suppression fichiers : la personne peut supprimer des fichiers.
- 🗂️ Suppression dossier : la personne peut supprimer le dossier entier.
Pour partager : clic droit sur un dossier → "Partager". Recherchez un collègue par nom ou service, cochez les permissions souhaitées, puis cliquez "Partager".
Pour révoquer un accès : ouvrez le partage du dossier → section "Accès actifs" → cliquez sur "Révoquer".`
  },
  {
    icon: "🔔",
    title: "Notifications",
    content: `Les notifications vous informent en temps réel de ce qui se passe sur vos dossiers :
- Quelqu'un a uploadé un fichier dans un dossier que vous partagez.
- Un fichier a été renommé ou supprimé dans un de vos dossiers.
- Quelqu'un a quitté un dossier que vous lui aviez partagé.
La cloche 🔔 en haut à droite affiche le nombre de notifications non lues. Cliquez dessus pour les voir toutes. Vous pouvez tout marquer comme lu d'un seul clic.`
  },
  {
    icon: "📦",
    title: "Archives",
    content: `Les archives permettent de sauvegarder temporairement un ou plusieurs fichiers :
- Créer une archive : allez dans le menu de votre profil (en haut à droite) → "Archives" → onglet "Créer". Sélectionnez les fichiers à archiver et confirmez.
- Consulter vos archives : onglet "Mes archives". Chaque archive a une date d'expiration automatique — elle sera supprimée après ce délai.
- Archivage multiple : vous pouvez cocher plusieurs fichiers à la fois et les archiver ensemble.`
  },
  {
    icon: "❓",
    title: "Questions fréquentes",
    content: `Q : Je n'arrive pas à supprimer un fichier — pourquoi ?
R : Vous pouvez supprimer uniquement vos propres fichiers, ou ceux dans un dossier dont le propriétaire vous a accordé la permission de suppression.

Q : Comment retrouver un fichier que j'ai reçu en partage ?
R : Dans la barre latérale, cliquez sur "🤝 Partagés avec moi". Tous les dossiers que vos collègues ont partagés avec vous apparaissent ici.

Q : Mon fichier n'est pas prévisualisable — que faire ?
R : Seuls les PDF, images, Word et Excel sont prévisualisables directement. Pour les autres formats, téléchargez le fichier pour l'ouvrir sur votre ordinateur.

Q : Comment changer mon mot de passe ?
R : Cliquez sur votre avatar en haut à droite → "Modifier le mot de passe". Entrez votre ancien mot de passe, puis le nouveau deux fois.`
  },
  {
    icon: "📞",
    title: "Contacter le support",
    content: `Si vous avez un problème technique ou une question, contactez votre administrateur :
- Administrateur système : MOHAMED — mohamed.fofana2022@esatic.edu.ci
- Responsable plateforme : FOFANA — moh.fofana21@gmail.com
Précisez dans votre message : votre nom, la section concernée (dossier, fichier, partage...) et une description du problème.`
  }
];

function HelpModal({ onClose }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-box" onClick={e => e.stopPropagation()}>
        <div className="help-modal-header">
          <h2>❓ Centre d'aide — DocFlow Pro</h2>
          <button className="help-modal-close" onClick={onClose}>✖</button>
        </div>
        <p className="help-modal-subtitle">
          Retrouvez ici toutes les réponses pour utiliser DocFlow Pro efficacement.
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

export default HelpModal;