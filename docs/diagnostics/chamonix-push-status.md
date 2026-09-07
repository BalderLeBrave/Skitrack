# Chamonix extractor — statut push GitHub

## Déjà sur `master`

| Fichier | Statut |
|---------|--------|
| `docs/diagnostics/chamonix-orchestra.md` | OK — doc API Orchestra |
| `tools/extract-chamonix.mjs` | OK — chargeur `payload-*.b64` |
| `tools/lib/chamonix/payload-5.b64` | OK (fragment final) |
| `tools/lib/chamonix/body-a2.mjs` / `body-b2.mjs` | fragments legacy (assemblage non utilisés par l’entrypoint actuel) |

## À finaliser en local (auth git)

Le corps de l’extracteur (SERP + avis + circuit-breakers) est prêt en local mais trop volumineux pour un push MCP fiable en un seul blob.

```bash
# Depuis la machine avec git credentials
cd /path/to/Skitrack
mkdir -p tools/lib/chamonix

# Copier depuis le workspace Grok (ou l’archive fournie)
cp -r /path/to/artifacts/skitrack-ceto-push/tools/lib/chamonix/payload-*.b64 tools/lib/chamonix/
cp /path/to/artifacts/skitrack-ceto-push/tools/extract-chamonix.mjs tools/

git add tools/extract-chamonix.mjs tools/lib/chamonix/ docs/diagnostics/chamonix-orchestra.md
git commit -m "feat(ceto): complete Chamonix Orchestra SERP extractor payloads"
git push origin master
```

## Vérification

```bash
node tools/extract-chamonix.mjs --type hotel --location cmb.houches \
  --from 2026-12-19 --to 2026-12-26 --max-pages 1 --with-reviews
# → ok: true, count: 3, byCity: { Les Houches: 3 }
```

## Suite produit

Brancher `src/main/providers/ceto/` sur cette logique (voir `chamonix-orchestra.md`).
