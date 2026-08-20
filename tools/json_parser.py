#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Parseur JSON / JSONP pour les centrales.

Les APIs Ingénie, MSEM et Open System ne parlent pas toutes le même dialecte :

- JSON strict (`{"success":1,...}`)
- JSONP (`cb({...});`, `jQuery123({...})`)
- objet JS inline dans un `<script>` (`var params = {...};`)

`parse()` accepte les trois. Aucun HTML ici — le DOM est dans
`extract_prix_centrale.py` (BeautifulSoup).

    from json_parser import object_after, parse

    parse('{"success":1,"data":{"total":"432,47 €"}}')["data"]["total"]
    parse('cb({"data":{"nbResultsFiche":1},"success":1});')["data"]["nbResultsFiche"]
    object_after('var params = {"cid":"5"};', "var params =")["cid"]
"""
from __future__ import annotations

import json
import re
from typing import Any

_CALLBACK = re.compile(
    r"^\s*(?:\/\*.*?\*\/\s*)?"
    r"(?:window\.)?(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*\s*\(\s*",
    re.S,
)


class JsonParseError(ValueError):
    pass


def _strip_js_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(^|[^:])//[^\n]*", r"\1", text)
    return text.strip()


def _balanced(text: str, start: int) -> str | None:
    """Sous-chaîne `{...}` ou `[...]` à partir de `start`, crochets équilibrés."""
    if start < 0 or start >= len(text) or text[start] not in "{[":
        return None
    opening = text[start]
    closing = "}" if opening == "{" else "]"
    depth = 0
    in_str = False
    quote = ""
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                in_str = False
            continue
        if ch in "\"'":
            in_str = True
            quote = ch
            continue
        if ch == opening:
            depth += 1
        elif ch == closing:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _loads(blob: str) -> Any:
    return json.loads(blob)


def parse(raw: str | bytes | None) -> Any:
    """JSON, JSONP, ou premier objet/tableau équilibré.

    Lève `JsonParseError` si rien n'est lisible.
    """
    if raw is None:
        raise JsonParseError("corps vide")
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    text = raw.strip()
    if not text:
        raise JsonParseError("corps vide")

    if text[0] in "{[":
        blob = _balanced(text, 0) or text
        try:
            return _loads(blob)
        except json.JSONDecodeError as e:
            raise JsonParseError(str(e)) from e

    unwrapped = _CALLBACK.sub("", text, count=1)
    unwrapped = re.sub(r"\)\s*;?\s*$", "", unwrapped.strip())
    if unwrapped[:1] in "{[":
        blob = _balanced(unwrapped, 0) or unwrapped
        try:
            return _loads(blob)
        except json.JSONDecodeError:
            pass

    cleaned = _strip_js_comments(text)
    for i, ch in enumerate(cleaned):
        if ch in "{[":
            blob = _balanced(cleaned, i)
            if not blob:
                continue
            try:
                return _loads(blob)
            except json.JSONDecodeError:
                continue
    raise JsonParseError(f"pas de JSON (début {text[:60]!r})")


def parse_or_none(raw: str | bytes | None) -> Any | None:
    try:
        return parse(raw)
    except JsonParseError:
        return None


def object_after(text: str, marker: str) -> Any | None:
    """Premier `{...}` après `marker` (ex. `var params =`)."""
    idx = text.find(marker)
    if idx < 0:
        return None
    brace = text.find("{", idx + len(marker))
    blob = _balanced(text, brace)
    if not blob:
        return None
    try:
        return _loads(blob)
    except json.JSONDecodeError:
        return None


def dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)
