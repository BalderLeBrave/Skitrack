# Webisation — cible future

**Rien de ce document n'est implémenté.** Il décrit ce que deviendrait
SKITRACK si l'application quittait le bureau pour le web, et surtout ce qui, dans
le code d'aujourd'hui, garde cette porte ouverte. À relire avant d'écrire quoi
que ce soit qui touche aux données de l'utilisateur.

## Pourquoi ce n'est pas fait

SKITRACK est une application de bureau mono-utilisateur. Il n'y a pas de
serveur à héberger, donc « comptes utilisateurs » et « base managée » n'ont pas
d'objet : on authentifierait quelqu'un auprès de sa propre machine, et on
paierait une base pour des données qui tiennent dans un `localStorage`.

Les deux choses qui justifieraient la bascule sont ailleurs :

1. **Le suivi de prix ne tourne que l'application ouverte.** C'est la limite la
   plus concrète du produit aujourd'hui — voir `hooks/usePriceRefresh`. Un
   relevé côté serveur la lèverait, et rendrait les alertes indépendantes de la
   présence de l'utilisateur.
2. **Le partage de séjour passe par un lien encodé ou un fichier**, faute
   d'URL hébergée — voir `domain/tripCodec`. Un serveur permettrait un lien
   court et durable.

Tant que ces deux besoins ne sont pas prioritaires, la webisation coûte plus
qu'elle ne rapporte.

## Le point de bascule : `store/userData.ts`

Tout ce qui appartient à la personne — favoris, séjours en préparation, alertes
de prix, drapeau de premier lancement — passe par ce module **et par lui seul**.
Aucun composant ne lit `localStorage` pour ces données.

C'est l'unique travail préparatoire qui a été fait, et c'est le seul qui compte.
Le jour de la bascule, on remplace l'implémentation de ces fonctions par des
appels HTTP ; la signature ne bouge pas, et aucun écran n'est touché.

Deux décisions du code actuel servent exactement à cela :

- **L'API est asynchrone** alors que `localStorage` est synchrone. Une API
  synchrone se laisse appeler pendant le rendu, et la conversion inverse
  coûterait une reprise de chaque appelant.
- **Tout ce qui est relu est validé** (`parseSavedTrip`, `parseAlert`,
  `parseFavorite`). Ces validateurs valent pour un stockage local corrompu comme
  pour une réponse serveur : ils ne sont pas à réécrire.

### Ce qu'il ne faut pas faire

Ne jamais ranger une donnée d'utilisateur dans `state/appState.tsx`. Les
préférences y sont réécrites en bloc à chaque frappe et ont déjà connu cinq
migrations de schéma ; un favori pris dans ce flux partirait à la prochaine.

## Ce que deviendrait chaque brique

| Aujourd'hui | Après webisation |
| --- | --- |
| `store/userData.ts` → `localStorage` | même module → appels HTTP |
| Aucune authentification | Auth requise, et seulement à ce moment-là |
| Relevé de prix quand l'app est ouverte | Tâche planifiée côté serveur, 24/7 |
| Notification native Electron (`app:notify`) | Notification serveur, e-mail possible |
| Partage par lien encodé / fichier `.skitrip` | Lien court hébergé, le format encodé restant en repli hors ligne |

### Candidats cohérents

**Supabase** (Postgres + auth + storage) pour les tables `users`, `favorites`,
`saved_trips`, `price_alerts`. Le modèle de données existe déjà : les interfaces
de `store/userData.ts` s'y transposent presque telles quelles.

**Tâches planifiées** pour le relevé : cron GitHub Actions sur le dépôt, ou
edge functions. C'est ce qui lèverait la limite « application ouverte » et
rendrait les alertes serveur-side — donc l'e-mail possible.

Attention : le moteur de relevé vit aujourd'hui dans le processus principal
Electron, avec Playwright, la lecture de `robots.txt` et les coupe-circuits par
hôte. Le porter côté serveur n'est pas un déplacement de fichiers — c'est un
chantier à part entière, et les règles de `PROVIDERS.md` s'y appliquent
intégralement. Un relevé serveur qui ignorerait `robots.txt` serait pire qu'un
relevé absent.

## Ce qui ne change pas

Les invariants du projet ne sont pas des propriétés du support :

- **Rien n'est inventé.** Un prix relevé côté serveur reste un prix relevé ; un
  prix absent reste absent. `PriceReading.o` distingue déjà `measured` de
  `estimated`, et cette distinction est ce qui autorise une notification.
- **Un échec de source reste local.** Une source en panne côté serveur produit
  une erreur motivée pour cette source, jamais un résultat vide global.
- **`robots.txt` fait autorité.** Y compris — surtout — depuis un serveur, où le
  volume de requêtes n'est plus borné par la patience d'un utilisateur.
