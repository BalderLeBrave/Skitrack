"""Gestes communs après un goto Booking (bandeau cookies, cartes lazy, souris)."""

from __future__ import annotations

import random
import re

CARD_SEL = (
    '[data-testid="property-card"], '
    '[data-testid="property-card-container"], '
    '[data-testid="sr-property-card"]'
)
CONSENT_SEL = (
    "#onetrust-accept-btn-handler, "
    "button#onetrust-accept-btn-handler, "
    '[data-testid="cookie-banner"] button, '
    "button[id*='onetrust-accept']"
)


def dismiss_consent(page: object) -> None:
    click = getattr(page, "click", None)
    locator = getattr(page, "locator", None)
    try:
        if callable(locator):
            loc = locator(CONSENT_SEL)
            first = getattr(loc, "first", loc)
            fn = getattr(first, "click", None)
            if callable(fn):
                fn(timeout=700)
                return
        if callable(click):
            click(CONSENT_SEL, timeout=700)
            return
    except Exception:
        pass
    get_by = getattr(page, "get_by_role", None)
    if not callable(get_by):
        return
    try:
        btn = get_by("button", name=re.compile(r"accept|accepter|j.accepte|ok", re.I))
        getattr(btn, "first", btn).click(timeout=500)
    except Exception:
        pass


def wait_cards(page: object, timeout_s: float) -> None:
    wait = getattr(page, "wait_for_selector", None)
    if not callable(wait):
        return
    try:
        wait(CARD_SEL, timeout=int(max(0.4, timeout_s) * 1000))
    except Exception:
        pass


def scroll_lazy(page: object, target: int = 22) -> None:
    loc_fn = getattr(page, "locator", None)
    wheel = getattr(getattr(page, "mouse", None), "wheel", None)
    evaluate = getattr(page, "evaluate", None)
    pause = getattr(page, "wait_for_timeout", None)

    def nudge(delta: int) -> None:
        try:
            if callable(wheel):
                wheel(0, delta)
            elif callable(evaluate):
                evaluate(f"window.scrollBy(0, {int(delta)})")
        except Exception:
            return

    nudge(800 + int(random.random() * 400))
    try:
        if callable(pause):
            pause(160 + int(random.random() * 140))
    except Exception:
        pass
    for _ in range(5):
        n = 0
        try:
            if callable(loc_fn):
                n = int(loc_fn(CARD_SEL).count())
        except Exception:
            n = 0
        if n >= target:
            return
        nudge(1400 + int(random.random() * 500))
        try:
            if callable(pause):
                pause(140 + int(random.random() * 120))
        except Exception:
            pass


def wander(page: object) -> None:
    """Déplacement de souris, sans clic : un clic au hasard tape le bandeau cookies."""
    mouse = getattr(page, "mouse", None)
    move = getattr(mouse, "move", None) if mouse is not None else None
    if not callable(move):
        return
    try:
        move(80 + random.random() * 480, 90 + random.random() * 240)
        move(200 + random.random() * 360, 140 + random.random() * 180)
    except Exception:
        pass


def prime_page(page: object, locale: str = "fr-FR") -> None:
    """Géo FR approximative. Pas d’en-têtes HTTP : l’empreinte du moteur reste."""
    ctx = getattr(page, "context", None)
    if ctx is None:
        return
    try:
        grant = getattr(ctx, "grant_permissions", None)
        if callable(grant):
            grant(["geolocation"])
    except Exception:
        pass
    try:
        geo = getattr(ctx, "set_geolocation", None)
        if callable(geo):
            geo(
                {
                    "latitude": round(44.9 + random.random() * 0.9, 4),
                    "longitude": round(5.3 + random.random() * 1.6, 4),
                }
            )
    except Exception:
        pass
    _ = locale


def settle(page: object, timeout_s: float, *, expect_cards: bool = True) -> None:
    dismiss_consent(page)
    if expect_cards:
        wait_cards(page, min(6.0, timeout_s))
        scroll_lazy(page)
        return
    pause = getattr(page, "wait_for_timeout", None)
    if callable(pause):
        try:
            pause(180 + int(random.random() * 220))
        except Exception:
            pass
