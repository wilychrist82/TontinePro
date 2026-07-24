# Tontine Pro - Documentation IA (gemini.md)

Ce document est conçu pour aider tout futur modèle d'Intelligence Artificielle (IA) à comprendre rapidement l'architecture, le fonctionnement et l'état actuel du projet **Tontine Pro**.

## 1. Ce que fait l'application
Tontine Pro est une application web (SaaS) de gestion de tontines (cercles d'épargne communautaires). Elle permet aux gestionnaires de créer des tontines, de suivre les cotisations, de gérer les membres, d'organiser les tours (qui reçoit les fonds) et d'avoir une vue globale sur les statistiques financières (taux de participation, retards, montants collectés). L'application se distingue par un design moderne, haut de gamme et réactif.

## 2. Fonctionnalités implémentées
- **Tableau de bord global** : Vue d'ensemble avec des statistiques (taux de complétion, paiements en attente/reçus/retards, prochain tour, tontines actives).
- **Gestion des membres** : Liste des membres avec statuts (à jour, en retard), possibilité d'ajouter ou de gérer les profils.
- **Gestion des Tontines (Cercles)** : Visualisation des tontines en cours, montants, fréquences, membres et progression.
- **Paiements et Transactions** : Module pour envoyer ou valider des paiements, avec historique des transactions.
- **Messagerie et Notifications** : Centre de notifications, messagerie interne pour communiquer avec le groupe ou certains membres, et barre de recherche globale (tontines et membres).
- **Rapports et Calendrier** : Vue détaillée des rapports d'activité, calendrier des tours prévus.
- **Profil et Paramètres** : Gestion du profil utilisateur, sécurité, et option de déconnexion.
- **Landing Page** : Pages de présentation marketing et informatives (Conditions, etc.) dans le dossier `Landing/`.

## 3. Technologies utilisées
- **Frontend Core** : HTML5 sémantique, CSS3 pur (Vanilla CSS avec variables, grid, flexbox, glassmorphism), JavaScript (ES6+ Vanilla).
- **Backend / BDD** : **Supabase** (PostgreSQL, Authentification, API REST) utilisé pour gérer les données de manière persistante (voir `supabase.js`).
- **Icônes** : SVG natifs ou bibliothèques légères (Feather Icons).
- **Aucun framework frontend lourd** : Ni React, ni Vue, ni Tailwind n'ont été imposés pour conserver un contrôle total sur l'esthétique et la légèreté.

## 4. Structure des fichiers
- `index.html` : Fichier principal du tableau de bord (Dashboard), contenant tous les onglets (tabs).
- `style.css` : Feuille de style principale avec l'implémentation du design system (couleurs, composants, micro-animations, mode sombre/clair).
- `app.js` : Contrôleur principal gérant l'interactivité du tableau de bord (navigation entre les onglets, gestion des modales, recherche, etc.).
- `supabase.js` : Configuration et initialisation du client Supabase.
- `data-service.js` : Couche de services gérant les appels asynchrones vers Supabase (CRUD, récupération des données).
- `config.js` : Fichier de configuration globale de l'application.
- `Landing/` : Dossier contenant la Landing Page du projet, le blog et les pages légales (`index.html`, `conditions.html`, etc.).
- `rebuild_app.js` / `rewrite.js` / `recover.js` : Scripts utilitaires (potentiellement utilisés pour restructurer, réparer ou générer le code).
- `.env.local` : Variables d'environnement (ex: clés Supabase).

## 5. Décisions de conception et Instructions pour l'IA

### Décisions de conception (Design Decisions)
- **Navigation par "Tabs" (Onglets)** : L'application est un "Single Page Application" statique simulée. Les vues (Tableau de bord, Membres, Messages) sont de simples `section` masquées ou affichées par la fonction `switchTab(tabId)` dans `app.js`.
- **Esthétique (Wow Effect)** : Une priorité absolue a été donnée au design. Les ombres portées douces, les bordures arrondies (`border-radius`), les dégradés subtils, et les micro-animations au survol (`hover` effect) sont obligatoires pour maintenir l'aspect Premium du SaaS.
- **Séparation des responsabilités** : `app.js` gère le DOM, tandis que `data-service.js` et `supabase.js` gèrent la donnée.

### Instructions de maintenance et d'évolution (Pour l'IA)
1. **Ajout de composants** : Si tu dois ajouter une nouvelle section, ajoute toujours une balise `<section class="tab-pane" id="tab-nouveau">` dans `index.html` et utilise les classes CSS existantes (`card`, `btn-primary`, `form-input`) de `style.css`.
2. **Événements JavaScript** : Lors de l'ajout de nouveaux boutons, préfère attacher les événements dans `app.js` au moment du chargement, ou via l'attribut `onclick` si c'est une action très isolée (comme une navigation simple).
3. **Mise en page** : Privilégie CSS Flexbox et Grid existants. N'ajoute pas de bibliothèques CSS externes.
4. **Supabase** : Pour toute nouvelle entité en base de données, assure-toi d'utiliser les méthodes asynchrones dans `data-service.js` (ex: `supabase.from('table').select()`).
5. **Recherche Globale** : Le système de recherche filtre actuellement l'état local JavaScript (`state.activeTontines`, `extendedMembers`). Si le projet scale avec des milliers d'entrées, il faudra migrer cette recherche vers une requête Supabase.
6. **Règle d'interaction** : Avant de donner une réponse à l'utilisateur, n'oublie jamais de l'appeler "wilfried".
