# Tontine Pro - Tableau de bord Premium

Ce projet est une démonstration interactive d'un tableau de bord de gestion de tontines (**Tontine Pro**), conçu avec un design moderne, épuré, adaptatif (Responsive) et haut de gamme.

## Fonctionnalités
- **Écran d'accueil / Splash Screen** : Une page d'introduction animée qui présente l'application avec un dégradé de couleurs sombres et vibrantes.
- **Tableau de bord principal** :
  - Solde global de la tontine avec sélecteur de devise.
  - Actions rapides : "Cotiser" et "Percevoir" avec des boîtes de dialogue/modales interactives.
  - Section "Envoi Rapide" : Visualisation rapide des avatars des membres pour initier une cotisation en un clic.
  - "Mes Tontines Actives" : Simulation de cartes de crédit/tontines virtuelles au design moderne (effet de brillance au survol).
- **Gestion du Cercle ("Mon Cercle")** :
  - Indicateur de progression du cycle en cours (graphique radial dynamique).
  - Calendrier interactif des tours de table (qui perçoit la tontine ce mois-ci).
  - Liste détaillée des membres avec indicateur de paiement en temps réel (Payé vs En attente).
  - Possibilité d'inviter de nouveaux membres via la modale "Ajouter un membre".
- **Statistiques & Rapports ("Statistiques")** :
  - Graphique à barres interactif avec courbe de tendance lumineuse (SVG dynamique).
  - Filtre "Dépenses" et "Cotisations".
  - Liste des transactions récentes mise à jour dynamiquement après chaque action.

## Technologies utilisées
- **Structure** : HTML5 sémantique.
- **Design & Mise en page** : CSS3 natif (Flexbox, Grid, Glassmorphism, Dégradés de fond, Micro-animations et responsive mobile).
- **Interactivité** : Vanilla JavaScript (gestion de l'état simulé des membres, transactions et événements interactifs).
- **Sans Dépendances** : Aucun framework lourd ou bibliothèque externe n'est requis (pas de React, Next, jQuery ni Chart.js externe qui pourrait être ralenti ou bloqué). Les icônes et graphiques utilisent des tracés SVG natifs optimisés.

## Comment exécuter le projet localement ?
1. Ouvrez simplement le fichier `index.html` dans n'importe quel navigateur web moderne.
2. Pour tester la version mobile, ouvrez les outils de développement de votre navigateur (F12) et basculez en mode responsive mobile.
