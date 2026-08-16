"""Référentiel : domaines skiables, pistes, remontées, enneigement.

Sources et confiance
--------------------
Chaque champ « altitude » porte une provenance explicite (`*_source`) parce que
les trois origines n'ont pas la même fiabilité :

* ``openskimap`` — dérivé de OSM, augmenté par le pipeline OpenSkiData. Bon sur
  les grands domaines, lacunaire sur les petits (une piste non cartographiée en
  bas de domaine remonte artificiellement `altitude_min_m`).
* ``ign`` / ``srtm`` — recalculé par nous sur les extrémités réelles des tracés.
* ``curated`` — saisi à la main dans ``data/curated/domains_*.yaml``, priorité
  absolue. C'est le seul moyen fiable pour `altitude_village_m`,
  `snowmaking_pct`, les dates de saison et l'URL de réservation officielle,
  qu'OSM ne porte pas ou porte trop mal (cf. docs/RISQUES.md).
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, Date, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, JSONType, UTCDateTime, utcnow


class SkiDomain(Base):
    """Domaine skiable (et non « station » : Les 3 Vallées = 1 domaine, 8 stations).

    L'unité de raisonnement de l'app est le domaine, parce que c'est lui qui
    porte l'altitude des pistes et la garantie d'enneigement.
    """

    __tablename__ = "ski_domain"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # --- Identité / provenance ---------------------------------------------
    source: Mapped[str] = mapped_column(String(32), default="openskimap")
    source_id: Mapped[str] = mapped_column(String(128))
    """Identifiant stable OpenSkiMap (SHA1). Sert de clé d'idempotence à l'import."""
    osm_id: Mapped[str | None] = mapped_column(String(64))
    wikidata_id: Mapped[str | None] = mapped_column(String(32))

    name: Mapped[str] = mapped_column(String(255), index=True)
    slug: Mapped[str] = mapped_column(String(255), index=True)
    country: Mapped[str | None] = mapped_column(String(2), index=True)  # ISO 3166-1 alpha-2
    region: Mapped[str | None] = mapped_column(String(128))  # ex. Savoie
    admin_code: Mapped[str | None] = mapped_column(String(8), index=True)  # ISO 3166-2, ex. FR-73
    massif: Mapped[str | None] = mapped_column(String(64), index=True)
    """Alpes du Nord / Alpes du Sud / Pyrénées / Vosges / Jura / Massif central /
    Corse / Dolomites / Tyrol… Déduit de `admin_code` (data/reference/massifs.yaml),
    surchargeable par le fichier curated."""
    localities: Mapped[list[str] | None] = mapped_column(JSONType)
    """Communes couvertes — sert à rattacher un logement géocodé au bon domaine."""

    status: Mapped[str] = mapped_column(String(32), default="operating", index=True)
    """operating / disused / abandoned / proposed. On n'affiche que `operating` par défaut."""

    # --- Altitudes (le critère décisif) -------------------------------------
    altitude_min_m: Mapped[int | None] = mapped_column(Integer, index=True)
    """Bas des pistes = point skiable le plus bas. **Pas** l'altitude du village."""
    altitude_max_m: Mapped[int | None] = mapped_column(Integer, index=True)
    altitude_village_m: Mapped[int | None] = mapped_column(Integer)
    """Front de neige principal. Non porté par OSM : estimé à partir de la gare de
    départ de remontée la plus basse, sinon saisi en curated."""
    altitude_source: Mapped[str] = mapped_column(String(16), default="openskimap")
    altitude_village_source: Mapped[str | None] = mapped_column(String(16))

    # --- Taille du domaine ---------------------------------------------------
    slopes_km_total: Mapped[float | None] = mapped_column(Float, index=True)
    slopes_km_by_color: Mapped[dict | None] = mapped_column(JSONType)
    """{"vert": 12.4, "bleu": 40.1, "rouge": 33.0, "noir": 8.2}"""
    slopes_count_by_color: Mapped[dict | None] = mapped_column(JSONType)
    """{"vert": 18, "bleu": 52, "rouge": 41, "noir": 9}"""
    lifts_count: Mapped[int | None] = mapped_column(Integer)
    lifts_count_by_type: Mapped[dict | None] = mapped_column(JSONType)
    lifts_km_total: Mapped[float | None] = mapped_column(Float)

    # --- Enneigement ---------------------------------------------------------
    glacier: Mapped[bool | None] = mapped_column(Boolean)
    """Présence d'un domaine glaciaire skiable. Non dérivable des stats OpenSkiMap :
    calculé par intersection Overpass `natural=glacier`, ou curated."""
    snowmaking_pct: Mapped[int | None] = mapped_column(Integer)
    """% de km de pistes équipés en neige de culture. OSM ne renseigne
    `piste:snowmaking` que sur ~4 % des domaines FR — valeur curated en pratique."""
    snowmaking_source: Mapped[str | None] = mapped_column(String(16))
    north_facing_pct: Mapped[int | None] = mapped_column(Integer)
    """% de km de pistes orientés N/NE/NO — meilleur proxy de tenue de neige que
    l'altitude seule à altitude égale. Calculé depuis les tracés (phase 2)."""

    # --- Liaisons ------------------------------------------------------------
    linked_domain_id: Mapped[int | None] = mapped_column(
        ForeignKey("ski_domain.id", ondelete="SET NULL"), index=True
    )
    """Domaine « parent » d'un ensemble relié (Les 2 Alpes ↔ La Grave).
    Attention : OpenSkiMap fusionne déjà beaucoup de liaisons en une seule entité
    (« Tignes - Val d'Isère », « Alpe d'Huez Grand Domaine »), ce champ ne sert
    donc qu'aux liaisons *non* fusionnées."""
    linked_pass_name: Mapped[str | None] = mapped_column(String(128))
    """Nom du forfait commun (Paradiski, 3 Vallées, Dolomiti Superski…)."""

    # --- Saison / réservation ------------------------------------------------
    season_open_typical: Mapped[dt.date | None] = mapped_column(Date)
    season_close_typical: Mapped[dt.date | None] = mapped_column(Date)
    official_website_url: Mapped[str | None] = mapped_column(Text)
    official_booking_url: Mapped[str | None] = mapped_column(Text)

    # --- Géométrie -----------------------------------------------------------
    centroid_lat: Mapped[float | None] = mapped_column(Float, index=True)
    centroid_lon: Mapped[float | None] = mapped_column(Float, index=True)
    bbox: Mapped[list[float] | None] = mapped_column(JSONType)  # [minlon, minlat, maxlon, maxlat]
    geometry: Mapped[dict | None] = mapped_column(JSONType)
    """Emprise GeoJSON (Polygon/MultiPolygon/Point). Les *tracés* de pistes sont
    dans `domain_slope` : les garder ici ferait des lignes de plusieurs Mo."""

    notes: Mapped[str | None] = mapped_column(Text)
    curated: Mapped[bool] = mapped_column(Boolean, default=False)
    """Vrai si au moins un champ vient du fichier curated (badge « vérifié » dans l'UI)."""
    imported_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    slopes: Mapped[list[DomainSlope]] = relationship(
        back_populates="domain", cascade="all, delete-orphan", lazy="selectin"
    )
    lifts: Mapped[list[DomainLift]] = relationship(
        back_populates="domain", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_domain_source"),
        # Le filtre principal de l'écran 1 : « bas des pistes ≥ X et pays = FR ».
        Index("ix_domain_alt_country", "country", "altitude_min_m", "altitude_max_m"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<SkiDomain {self.id} {self.name!r} {self.altitude_min_m}-{self.altitude_max_m}m>"


class DomainSlope(Base):
    """Tracé d'une piste. Import optionnel (`--with-runs`) : le dump complet pèse
    plusieurs centaines de Mo, on ne charge que les pays demandés."""

    __tablename__ = "domain_slope"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    domain_id: Mapped[int] = mapped_column(
        ForeignKey("ski_domain.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    difficulty: Mapped[str | None] = mapped_column(String(24), index=True)
    """Convention OpenSkiData : novice/easy/intermediate/advanced/expert/freeride.
    La couleur européenne (vert/bleu/rouge/noir) en est dérivée, pas stockée :
    la même difficulté se colore différemment en Amérique du Nord."""
    length_m: Mapped[float | None] = mapped_column(Float)
    elevation_min_m: Mapped[float | None] = mapped_column(Float)
    elevation_max_m: Mapped[float | None] = mapped_column(Float)
    aspect_deg: Mapped[float | None] = mapped_column(Float)  # orientation moyenne
    snowmaking: Mapped[bool | None] = mapped_column(Boolean)
    geometry: Mapped[dict | None] = mapped_column(JSONType)  # LineString / MultiLineString

    domain: Mapped[SkiDomain] = relationship(back_populates="slopes")


class DomainLift(Base):
    """Remontée mécanique. Sa gare aval est le meilleur proxy disponible du
    « front de neige » — c'est le point que vise réellement un skieur à pied."""

    __tablename__ = "domain_lift"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    domain_id: Mapped[int] = mapped_column(
        ForeignKey("ski_domain.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    lift_type: Mapped[str | None] = mapped_column(String(32))
    length_m: Mapped[float | None] = mapped_column(Float)
    elevation_min_m: Mapped[float | None] = mapped_column(Float)
    elevation_max_m: Mapped[float | None] = mapped_column(Float)
    base_lat: Mapped[float | None] = mapped_column(Float, index=True)
    base_lon: Mapped[float | None] = mapped_column(Float, index=True)
    geometry: Mapped[dict | None] = mapped_column(JSONType)

    domain: Mapped[SkiDomain] = relationship(back_populates="lifts")


class SnowReport(Base):
    """Bulletin neige / météo daté par domaine (Open-Meteo, Météo-France).
    Phase 4 côté UI, table posée dès maintenant pour ne pas migrer plus tard."""

    __tablename__ = "snow_report"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    domain_id: Mapped[int] = mapped_column(
        ForeignKey("ski_domain.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[str] = mapped_column(String(32))
    observed_on: Mapped[dt.date] = mapped_column(Date, index=True)
    snow_depth_bottom_cm: Mapped[int | None] = mapped_column(Integer)
    snow_depth_top_cm: Mapped[int | None] = mapped_column(Integer)
    fresh_snow_24h_cm: Mapped[int | None] = mapped_column(Integer)
    lifts_open: Mapped[int | None] = mapped_column(Integer)
    slopes_open: Mapped[int | None] = mapped_column(Integer)
    avalanche_risk: Mapped[int | None] = mapped_column(Integer)  # 1..5 (BRA)
    raw: Mapped[dict | None] = mapped_column(JSONType)
    fetched_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("domain_id", "source", "observed_on", name="uq_snow_report"),
    )
