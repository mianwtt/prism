"""SearXNG engine adapter for Bing's public RSS result endpoint.

Parse XML as bytes, avoiding the generic XPath engine's HTML/encoding-declaration
failure. This only discovers URLs; result descriptions are not product evidence.
"""
from html import unescape
import re
from urllib.parse import urlencode
from xml.etree import ElementTree

categories = ["general"]
paging = False
safesearch = False


def request(query, params):
    params["url"] = "https://www.bing.com/search?" + urlencode({"q": query, "format": "rss"})
    return params


def response(resp):
    root = ElementTree.fromstring(resp.content)
    return [
        {
            "url": item.findtext("link", ""),
            "title": unescape(item.findtext("title", "")),
            "content": re.sub(r"<[^>]+>", " ", unescape(item.findtext("description", ""))),
        }
        for item in root.findall("./channel/item")
        if item.findtext("link", "").startswith(("https://", "http://"))
    ]
