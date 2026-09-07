"""
Gestionnaire de proxies
"""
import logging
import os
import random
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Proxy:
    host: str
    port: int
    username: str | None = None
    password: str | None = None
    
    @property
    def url(self) -> str:
        if self.username and self.password:
            return f"http://{self.username}:{self.password}@{self.host}:{self.port}"
        return f"http://{self.host}:{self.port}"


class ProxyManager:
    def __init__(self, proxy_list: str | None = None):
        self.proxies: list[Proxy] = []
        self._load_proxies(proxy_list or os.getenv("PROXY_LIST", ""))
        self.current_index = 0
        logger.info(f"ProxyManager initialisé avec {len(self.proxies)} proxies")
    
    def _load_proxies(self, proxy_list: str):
        if not proxy_list:
            logger.warning("Aucun proxy configuré")
            return
        
        for proxy_str in proxy_list.split(","):
            proxy_str = proxy_str.strip()
            if not proxy_str:
                continue
            
            try:
                proxy = self._parse_proxy(proxy_str)
                if proxy:
                    self.proxies.append(proxy)
            except ValueError as e:
                logger.error(f"Proxy illisible '{proxy_str}': {e}")
    
    def _parse_proxy(self, proxy_str: str) -> Proxy | None:
        if "@" in proxy_str:
            auth_part, host_part = proxy_str.split("@", 1)
            username, password = auth_part.split(":", 1)
            host, port = host_part.split(":", 1)
        else:
            username = password = None
            host, port = proxy_str.split(":", 1)
        
        return Proxy(
            host=host,
            port=int(port),
            username=username,
            password=password
        )
    
    def get_random_proxy(self) -> str | None:
        if not self.proxies:
            return None
        proxy = random.choice(self.proxies)
        return proxy.url
