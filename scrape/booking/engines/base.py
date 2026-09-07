"""Contrat d’un moteur Booking. Pas d’import Playwright ici."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from proxy import Proxy


class EngineError(Exception):
    def __init__(self, message: str, *, blocked: bool = False, unavailable: bool = False) -> None:
        super().__init__(message)
        self.blocked = blocked
        self.unavailable = unavailable


@dataclass
class Snapshot:
    html: str
    url: str
    blocked: bool = False
    reason: str | None = None
    ms: int = 0
    listings: list | None = None


class BrowserSession(Protocol):
    name: str

    def goto(self, url: str, timeout_s: float) -> Snapshot: ...

    def close(self) -> None: ...


class Engine(Protocol):
    name: str

    def available(self) -> bool: ...

    def open(self, *, proxy: Proxy | None, headless: bool, locale: str, timeout_s: float) -> BrowserSession: ...
