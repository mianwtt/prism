"""JSON stdin/stdout bridge. Diagnostics stay off the protocol stream."""
import json
import logging
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
logging.basicConfig(level=logging.CRITICAL)

def main():
    request=json.loads(sys.stdin.read(10000))
    if request.get('operation')=='images':
        from page_images import previews
        urls=request.get('urls',[])
        if not isinstance(urls,list) or len(urls)>6 or any(not isinstance(u,str) or len(u)>2000 for u in urls):
            raise ValueError('invalid image sources')
        return {'results':[], 'images':previews(urls)}
    from tofu_search import configure, search, fetch_url
    configure(filter_enabled=False,llm_api_key='',llm_function=None,
              fetch_top_n=4,fetch_timeout=10,fetch_max_chars_search=10000,
              search_deadline_secs=40,fetch_url_deadline_secs=20,
              allow_insecure_ssl_fallback=False)
    if request.get('operation')=='fetch':
        from urllib.parse import urlsplit
        url=request.get('url','')
        parsed=urlsplit(url)
        if parsed.scheme not in ('https','http') or parsed.username or parsed.password:
            raise ValueError('invalid URL')
        return {'results':[], 'text':fetch_url(url,max_chars=16000,timeout=10) or ''}
    query=request.get('query')
    if not isinstance(query,str) or not 1<=len(query.strip())<=500:
        raise ValueError('invalid query')
    results=search(query,max_results=4)
    normalized=[{'title':r.get('title',''),'url':r.get('url',''),
                 'raw_content':r.get('full_content') or '',
                 'content':r.get('snippet') or '',
                 'engine':r.get('source',''),
                 'retrieval':{'bodyChars':len(r.get('full_content') or ''),
                              'snippetOnly':not bool(r.get('full_content')),
                              'deadlineHit':bool(getattr(results,'_deadline_hit',False))}} for r in results]
    return {'results':normalized,'deadlineHit':bool(getattr(results,'_deadline_hit',False))}

try:
    response=main()
except Exception as error:
    response={'errorType':type(error).__name__}
print(json.dumps(response,ensure_ascii=True),flush=True)
