#!/usr/bin/env bash
# Serveur d'aperçu navigateur du renderer (dev uniquement).
#
# Pourquoi un build et non le serveur de dev : `components/photos.ts` charge
# ~330 photos de stations par `import.meta.glob({ eager: true })`. En mode dev,
# Vite en fait une requête par image, et l'ingress de l'environnement répond
# 429 sur la rafale — l'aperçu restait blanc une fois sur deux. Le build les
# empaquette : une seule requête, plus de rafale.
#
# `--watch` garde `dist-preview` à jour à chaque enregistrement (≈9 s) ; il
# suffit de recharger l'aperçu.
set -e
cd /app

npx vite build --config vite.preview.config.ts
npx vite build --config vite.preview.config.ts --watch &

exec npx vite preview --config vite.preview.config.ts
