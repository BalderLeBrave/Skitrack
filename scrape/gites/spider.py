"""Spider Scrapy — devis ITEA (HTTP). La SERP Cloudflare passe par fetch_serp."""

from __future__ import annotations

import scrapy

from itea import quote
from parse import keep_gite, tiles_from_html
from urls import search_url


class GitesSpider(scrapy.Spider):
    name = "gites"
    custom_settings = {
        "ROBOTSTXT_OBEY": False,
        "CONCURRENT_REQUESTS": 1,
        "DOWNLOAD_DELAY": 1.2,
        "LOG_LEVEL": "INFO",
    }

    def __init__(
        self,
        destination: str = "Les 2 Alpes",
        check_in: str = "2027-02-06",
        check_out: str = "2027-02-13",
        adults: str = "8",
        bedrooms: str = "4",
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.destination = destination
        self.check_in = check_in
        self.check_out = check_out
        self.adults = int(adults)
        self.bedrooms = int(bedrooms or 0)

    def start_requests(self):
        from fetch_serp import fetch_serp

        url = search_url(self.destination, self.check_in, self.check_out, adults=self.adults)
        html, engine = fetch_serp(url)
        self.logger.info("serp %s tiles_engine=%s", url, engine)
        for card in tiles_from_html(html):
            if self.bedrooms and int(card.get("bedrooms") or 0) < self.bedrooms:
                continue
            yield scrapy.Request(
                card["url"],
                callback=self.parse_card,
                cb_kwargs={"card": card},
                dont_filter=True,
            )

    def parse_card(self, response, card):
        q = quote(card["sourceId"], self.check_in, self.check_out, self.adults)
        if not q.get("available"):
            return
        if not keep_gite(ident=str(q.get("ident") or ""), url=card["url"]):
            return
        row = {
            "source": "gites-web",
            "sourceId": card["sourceId"],
            "title": card.get("title"),
            "url": card["url"],
            "totalPrice": q["totalPrice"],
            "currency": "EUR",
            "priceConfidence": "total_confirmed",
            "availabilityStatus": "available",
            "guests": card.get("guests"),
            "bedrooms": card.get("bedrooms"),
            "checkIn": self.check_in,
            "checkOut": self.check_out,
        }
        lat = q.get("latitude") if q.get("latitude") is not None else card.get("latitude")
        lon = q.get("longitude") if q.get("longitude") is not None else card.get("longitude")
        if lat is not None and lon is not None:
            row["latitude"] = lat
            row["longitude"] = lon
        if q.get("city") or card.get("city"):
            row["city"] = card.get("city") or q.get("city")
        yield row
