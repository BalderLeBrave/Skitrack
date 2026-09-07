# Déploiement GitHub automatisé

## Principe

Ne **jamais** coller un PAT dans le chat Grok. Le script lit `GITHUB_TOKEN` dans l’environnement.

```bash
# Fine-grained PAT : repo Skitrack → Contents: Read and write
export GITHUB_TOKEN=github_pat_…
export GITHUB_OWNER=BalderLeBrave   # optionnel
export GITHUB_REPO=Skitrack        # optionnel
export GITHUB_BRANCH=master        # optionnel

# Aperçu
node scripts/deploy-github.mjs --dry-run

# Déploie le paquet Ceto + wiring + CI
node scripts/deploy-github.mjs --message "feat(ceto): deploy sprint1"

# Un sous-chemin seulement
node scripts/deploy-github.mjs --only src/main/providers/ceto/
```

## Création du token (une fois)

1. GitHub → **Settings** → **Developer settings** → **Fine-grained tokens**
2. Resource owner : ton compte
3. Repository access : **Only** `BalderLeBrave/Skitrack`
4. Permissions → **Contents** → **Read and write**
5. Generate → copier dans un gestionnaire de secrets (1Password, etc.)
6. Shell : `export GITHUB_TOKEN=…` (session courante) ou entrée dans `~/.bashrc` **hors dépôt**

Révoquer dès qu’un token a fuité dans un chat ou un log.

## CI (GitHub Actions)

Fichier `.github/workflows/ci.yml` : typecheck + tests smoke à chaque push/PR sur `master`.

Pas de secret requis pour la CI (tests publics, pas de déploiement depuis Actions pour l’instant).

## npm

```json
"deploy:github": "node scripts/deploy-github.mjs"
```

## Dépannage

| Erreur | Cause |
|--------|--------|
| `GITHUB_TOKEN manquant` | `export` oublié |
| `401 Bad credentials` | token révoqué / typo |
| `403 Resource not accessible` | permission **Contents** absente |
| `409 Conflict` | SHA obsolète — relancer le script (il relit le SHA) |
