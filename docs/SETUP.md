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

Do not put credentials in questions, exported decisions, screenshots or issue reports.

## Configuration and storage

The UI stores provider settings in ignored `data/provider-settings.json`. Alternatively, copy [.env.example](../.env.example) to `.env` and replace its `XXX` values locally. UI settings take precedence over `.env`; restart after editing `.env`.

| Variable | Purpose |
| --- | --- |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Model connection |
| `SEARCH_PROVIDER` | `tofu` or `tavily` |
| `TAVILY_API_KEY` | Required only for Tavily |
| `PORT`, `HOST` | Defaults: `4317`, `127.0.0.1` |
| `PRISM_DATA_DIR` | Separate decision/configuration directory |
| `TOFU_PYTHON` | Optional search-interpreter override |

Provider settings are plaintext local files. Decisions, source snapshots, tasks and SQLite checkpoints stay in `data/` by default; search tooling and experiments stay in `work/`. Both directories and `.env` are ignored by Git. Exports contain decision content but omit provider configuration; inspect them before sharing.

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
