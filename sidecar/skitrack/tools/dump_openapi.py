"""Écrit le schéma OpenAPI sur stdout, sans démarrer de serveur.

Alimente `npm run gen:types`, qui le convertit en types TypeScript
(`src/renderer/src/api/types.gen.ts`). Le front est ainsi typé depuis les
modèles Pydantic : renommer un champ côté Python casse la compilation du front
au lieu de produire un `undefined` silencieux à l'écran.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


def main() -> int:
    # La création de l'app n'ouvre pas la base (c'est le lifespan qui le fait),
    # mais on isole quand même le répertoire de données pour ne rien toucher.
    from ..config import Settings, set_settings

    set_settings(Settings(data_dir=Path(tempfile.gettempdir()) / "skitrack-openapi"))

    from ..app import create_app

    schema = create_app().openapi()
    json.dump(schema, sys.stdout, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
