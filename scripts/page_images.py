"""Bounded public-page preview metadata. No image files or credentials are fetched."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import ipaddress
import socket
import time
from urllib.parse import urlsplit, urljoin
import requests

def public_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise ValueError('public HTTPS required')
    addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('private destination rejected')
    return url

class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta' and (a.get('property') or a.get('name') or '').lower() in ('og:image', 'twitter:image'):
            if a.get('content'): self.values.append(a['content'])

def preview(original):
    try:
        current = original
        start = time.monotonic()
        for _ in range(3):
            public_url(current)
            with requests.get(current, timeout=5, allow_redirects=False, stream=True,
                              headers={'User-Agent': 'PrismPagePreview/0.2'}) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    current = urljoin(current, response.headers.get('Location', ''))
                    continue
                if response.status_code != 200 or 'html' not in response.headers.get('Content-Type', ''):
                    return None
                data = bytearray()
                for chunk in response.iter_content(16384):
                    if len(data) + len(chunk) > 500000 or time.monotonic() - start > 8:
                        break
                    data.extend(chunk)
                parser = Images()
                parser.feed(data.decode(response.encoding or 'utf-8', errors='replace'))
                for value in parser.values:
                    image = urljoin(current, value)
                    try:
                        public_url(image)
                    except Exception:
                        continue
                    return {'sourceUrl': original, 'pageUrl': current, 'url': image, 'kind': 'page-preview'}
                suffix=next((s for s in ('specs/','techspec/') if urlsplit(current).path.endswith('/'+s)),None)
                if suffix:
                    current = current[:-len(suffix)]
                    continue
                return None
    except Exception:
        return None

def previews(urls):
    with ThreadPoolExecutor(max_workers=3) as pool:
        return [item for item in pool.map(preview, urls[:6]) if item]
