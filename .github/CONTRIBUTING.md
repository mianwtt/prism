# Contributing to Prism

Prism connects agent research, saved evidence, interactive conditions and persistent decisions. Contributions should improve that workflow across domains rather than introduce another hardcoded product form.

## Local development

Use Node.js 22.9+ (24 recommended), `npm ci`, then `npm start`. Reinstall dependencies when changing Node major versions because SQLite uses a native binary. Both fictional demos work without credentials. Optional model/search setup is documented in [README](../README.md). Use a separate `PRISM_DATA_DIR` for experiments; never modify another person's saved snapshots.

Before proposing changes, run:

```sh
npm run check
npm test
npm run test:browser
npm run test:runtime
```

Browser tests default to installed Chrome. For Playwright Chromium, install it and set `PLAYWRIGHT_CHANNEL=chromium`. See [README](../README.md#development-and-verification).

Tests for behavior changes should exercise the actual evaluator, HTTP flow or graph when appropriate. Keep fixtures explicitly fictional; never turn captured merchant data into a claim of a live test. New dimensions must work through the shared typed schema. Do not allow model-generated JavaScript, HTML or arbitrary formulas to execute.

## Useful contributions

- A small labeled extraction corpus: exact configuration, saved public excerpt, URL and capture time, with permission to redistribute.
- Multi-source entity matching and explicit conflicting observations without silently choosing a convenient value.
- Keyboard/screen-reader interaction and clear touch controls for the canvas.
- Reproducible first-run problems on Windows, macOS or Linux.
- Small, isolated fixes with a clear trigger, resulting behavior and relevant validation.

## Issues and pull requests

For bugs, describe steps, expected/actual behavior, OS, Node version and whether you used the demo or live research. Include a sanitized screenshot or minimal fictional snapshot. Never post `.env`, `data/provider-settings.json`, checkpoints, personal decisions, full provider responses or API keys. For security issues follow [SECURITY](SECURITY.md).

Explain why a change helps the user, what changed and how you verified it. Mention remaining limitations. Do not add an external dependency without explaining its need and license. Keep unrelated formatting and generated files out of the change.

Contributions are provided under the repository's [MIT license](../LICENSE). Third-party data and media must have appropriate redistribution rights.
