"""Small, bounded live probe; use the isolated Python environment in work/.

No model credentials or paid search APIs are used. Raw page text stays under
ignored work/. A successful HTTP request is not a relevance or truth verdict.
"""
import argparse
import importlib.metadata
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'work' / 'tofu-evaluation'
CASES = {
    'cn-budget': ('search', '7000元 32GB 轻薄 笔记本 Java 开发'),
    'cn-official': ('search', '联想 ThinkBook 14 官方 内存 重量 参数'),
    'en-laptop': ('search', 'ASUS Zenbook 14 OLED UX3405 weight memory specifications'),
    'fetch-python': ('fetch', 'https://docs.python.org/3/library/asyncio.html'),
    'fetch-asus': ('fetch', 'https://www.asus.com/laptops/for-home/zenbook/asus-zenbook-14-oled-ux3405/techspec/'),
}

def run_case(name):
    logging.basicConfig(level=logging.CRITICAL)
    import tofu_search
    from tofu_search import configure, search, fetch_url
    configure(filter_enabled=False, llm_api_key='', llm_function=None,
              fetch_top_n=4, fetch_timeout=10, fetch_max_chars_search=10000,
              search_deadline_secs=40, fetch_url_deadline_secs=20,
              allow_insecure_ssl_fallback=False)
    kind, target = CASES[name]
    record = {'case': name, 'kind': kind, 'target': target,
              'version': importlib.metadata.version('tofu-search'),
              'retrievedAt': datetime.now(timezone.utc).isoformat(),
              'llm': False, 'paidSearchCredentials': False,
              'playwright': False}
    started = time.perf_counter()
    try:
        if kind == 'search':
            result = search(target, max_results=4)
            record['results'] = [dict(r) for r in result]
            record['count'] = len(result)
            record['bodyCount'] = sum(len(str(r.get('full_content') or '')) >= 300 for r in result)
            record['engineCounts'] = {k: len(v) for k, v in (getattr(result, '_engine_breakdown', None) or {}).items()}
            record['deadlineHit'] = bool(getattr(result, '_deadline_hit', False))
            # Full diagnostics may contain network details; only retain locally.
            record['diagnostics'] = getattr(result, '_search_diag', None)
        else:
            text = fetch_url(target, max_chars=15000, timeout=10)
            record['body'] = text or ''
            record['characters'] = len(text or '')
        record['status'] = 'completed'
    except Exception as error:
        record.update(status='error', errorType=type(error).__name__)
    record['seconds'] = round(time.perf_counter()-started, 2)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (name+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
    print(json.dumps(summary(record),ensure_ascii=True),flush=True)

def summary(record):
    fields = ['case','kind','version','status','seconds','count','bodyCount','characters','engineCounts','deadlineHit','processTimeout']
    out = {k:record[k] for k in fields if k in record}
    out['samples'] = [{'title':r.get('title'), 'url':r.get('url'), 'source':r.get('source'),
                       'characters':len(str(r.get('full_content') or ''))}
                      for r in record.get('results', [])]
    return out

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--case',choices=CASES)
    args=parser.parse_args()
    if args.case:
        run_case(args.case)
    else:
        OUT.mkdir(parents=True,exist_ok=True)
        summaries=[]
        for name in CASES:
            destination=OUT/(name+'.json')
            destination.unlink(missing_ok=True)
            try:
                finished=subprocess.run([sys.executable,str(Path(__file__).resolve()),'--case',name],
                    cwd=ROOT,capture_output=True,timeout=75,
                    env={**os.environ,'PYTHONIOENCODING':'utf-8'})
                if destination.exists():
                    record=json.loads(destination.read_text(encoding='utf-8'))
                else:
                    record={'case':name,'status':'process-error','exitCode':finished.returncode}
            except subprocess.TimeoutExpired:
                record=json.loads(destination.read_text(encoding='utf-8')) if destination.exists() else {'case':name,'status':'timeout'}
                record['processTimeout']=True
            row=summary(record);summaries.append(row)
            print(json.dumps(row,ensure_ascii=True),flush=True)
        (OUT/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8')
