# Setup

[中文首页](../README.md) · [English](i18n/README.en.md) · [Workspace guide](WORKSPACE.md)

## Native installation

Download or clone the source repository and open a terminal in its root directory. Use **Node.js 24** (recommended) or a current Node 22 release, at least 22.9, and npm. Clean Windows installations have passed on Node 24.19.0 and 22.23.5.

```sh
npm ci
npm start
```

Open [localhost:4317](http://localhost:4317). The laptop and housing demos use explicitly fictional data and need no model configuration. The housing fixture has no fabricated listing photographs. For a ready-made multi-branch canvas, download an [example JSON](../examples/README.md), then select **导入决策文件** in the sidebar.

## Connect live research

### Ollama and tofu

1. Run Ollama and install a model that can return structured JSON reliably. Use `ollama list` to find the exact installed model ID.
2. Install [uv](https://docs.astral.sh/uv/), then run:

   ```sh
   npm run setup:search
   ```

   This creates the optional Python search environment under ignored `work/tofu-venv/` and installs [requirements-search.txt](../scripts/requirements-search.txt).

3. Open **研究设置** and enter:

   | Setting | Native local Ollama |
   | --- | --- |
   | Model Base URL | `http://localhost:11434/v1` |
   | Model ID | An exact ID from `ollama list` |
   | Model API key | `ollama` — a local placeholder |
   | Search provider | `tofu-search` |

4. Save, ask a question on the home page and continue from the canvas. Use an explicit research request when you want the agent to search again.

The measured rental runs used `qwen3.5:9b`; this records that configuration, not compatibility with every model. Tofu needs network access and depends on search engines and readable pages. It does not require a commercial search key.

### Other providers

Compatible Chat Completions endpoints can replace Ollama. Set their Base URL, exact model ID and provider key in the same screen. Tavily is an optional search backend requiring its own key.

### SearXNG and additional page reading

With Docker Desktop running, start the bundled local search service:

```sh
npm run search:up
```

This starts a pinned SearXNG image on **http://127.0.0.1:4330**, enables its JSON API, and checks an actual search response before reporting success. Select **SearXNG** in 研究设置 and enter that URL. Set `SEARXNG_ENGINES=bingrss` in `.env` to explicitly select the bundled Bing public RSS reader; restart the app after changing `.env`. No tofu Python environment or Tavily key is required. The service reads Bing's public RSS search results, not a paid search API. Its results are discovery leads, never price evidence. Shop-native catalogues supplement missing or irrelevant results.

The generated service secret stays in ignored `work/search-service/settings.yml`. Existing settings are preserved. Stop the service with `npm run search:down`. For another instance, enable JSON (`search.formats: [html, json]`); some public instances disable JSON, and `403` means that API is unavailable. Native engine availability varies by network; the checked local setup uses `bingrss` rather than assuming every engine works.

Set `SEARXNG_URL` alongside tofu/Tavily settings to add another discovery service. Optional dynamic rendering uses an existing Crawl4AI service via `CRAWL4AI_URL` and `CRAWL4AI_API_TOKEN`; these services are not silently installed. See [same-product offers](MULTI-SOURCE-OFFERS.md).

An actually verified task is: `预算2000元，购买树莓派5的8GB单板，不要配件套装，比较不同商家的公开报价。` DFRobot and Waveshare readers follow public catalogue links, verify the detail's selected RAM and bundle, and retain original photographs. Waveshare's JavaScript price uses Microsoft Edge: install Edge and set `PRISM_BROWSER_CHANNEL=msedge` if needed. Public prices can change; the dated acceptance record is an observation, not a price guarantee.

Do not put credentials in questions, exported decisions, screenshots or issue reports.

## Configuration and storage

The UI stores provider settings in ignored `data/provider-settings.json`. Alternatively, copy [.env.example](../.env.example) to `.env` and replace its `XXX` values locally. UI settings take precedence over `.env`; restart after editing `.env`.

| Variable | Purpose |
| --- | --- |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Model connection |
| `SEARCH_PROVIDER` | `tofu`, `tavily` or `searxng` |
| `SEARXNG_URL`, `SEARXNG_ENGINES` | SearXNG instance and optional engines; enable JSON format |
| `CRAWL4AI_URL`, `CRAWL4AI_API_TOKEN` | Optional existing Crawl4AI renderer |
| `TAVILY_API_KEY` | Required only for Tavily |
| `PORT`, `HOST` | Defaults: `4317`, `127.0.0.1` |
| `PRISM_DATA_DIR` | Separate decision/configuration directory |
| `TOFU_PYTHON` | Optional search-interpreter override |
| `REDIS_URL` | Optional search cache; unset or `XXX` disables it |
| `REDIS_SEARCH_TTL_SECONDS` | Search cache lifetime, 1–3600 seconds, default 300 |
| `REDIS_CACHE_TIMEOUT_MS` | Cache connection/operation budget, 1–5000ms, default 300 |

Provider settings are plaintext local files. Decisions, source snapshots, tasks and SQLite checkpoints stay in `data/` by default; search tooling and experiments stay in `work/`. Both directories and `.env` are ignored by Git. Exports contain decision content but omit provider configuration; inspect them before sharing.

Redis is optional and configured through the startup environment or local `.env`, not the model settings dialog. It caches successful search results with their original acquisition time; independent page/price reads and citation rechecks remain uncached. A Redis failure falls back to the original search. See the [technical report](TECHNICAL-REPORT.md) for native/Compose setup, cache statistics and the separate real-Redis test.

## Diagnostics

```sh
npm run doctor
npm run doctor -- --connect
```

The first command checks dependencies, storage and configuration. `--connect` additionally probes the model's `/models` endpoint without inference or search. Neither prints credentials. Missing live configuration returns a nonzero exit code; demos remain available.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Demo works, live research does not | Save model/search settings, run `doctor -- --connect`, and confirm the model ID with `ollama list`. |
| Tofu interpreter or dependency missing | Run `npm run setup:search`; check any `TOFU_PYTHON` override. |
| Planning fails or facts remain incomplete | Check structured-output behavior and source availability. Keep missing values explicit. |
| A source redirects to login or verification | Try other public sources or retry later. Prism does not log in or solve access challenges. |
| Native SQLite dependency installation fails | Use Node 24. Inspect npm logs for a prebuilt download failure or required native build tools; a partial install is not a working installation. |
| SQLite reports a different `NODE_MODULE_VERSION` | Run `npm ci` under the selected Node version. Do not reuse another Node major's `node_modules/`. |
| Port 4317 is occupied | Choose another port; do not terminate an unrelated service. |

Different port, Windows PowerShell:

```powershell
$env:PORT = "4319"
npm start
```

Different port, POSIX shell:

```sh
PORT=4319 npm start
```

Keep `HOST` bound to loopback. See [security](../.github/SECURITY.md) and [Docker notes](DEVELOPMENT.md#docker) for deployment boundaries.
