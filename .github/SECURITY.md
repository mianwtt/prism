# Security and privacy

Prism 0.4 is designed for a single user on their own machine. It has no authentication, public-hosting security model or multi-user isolation. Keep its port bound to loopback. A cloud model receives your question and retrieved excerpts; search queries go to the selected search backend. Source reads and remote images also contact third-party hosts.

## Private local files

- `.env` and `data/provider-settings.json` contain plaintext configuration and credentials.
- `data/` contains personal questions, saved sources, decisions and checkpoint state.
- `work/` contains local search runtimes, experiments and browser artifacts.
- Decision JSON exports may contain sensitive questions, copied source text and personal reasoning. They omit provider configuration but are not anonymized.

These paths are ignored by Git. The publication check inspects staged files for private paths and recognized credential patterns; it is a heuristic, not a complete private-data detector. If a key is exposed, revoke it at its provider and remove it from any public history.

Imported snapshots are untrusted material. Import validates bounded data structures and public HTTPS URLs, creates a new root and drops job identities, generated analysis and human confirmation authority. Import itself does not fetch sources. Public URL checks do not establish the trustworthiness of a website or prevent every DNS/network edge case; review imported sources before asking for research or rechecking them. Never place secrets into a research question to test the model.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** option if private reporting has been enabled. If unavailable, open an issue requesting a private contact without including exploit details or private data. There is no separate security team or promised response SLA.

Describe the affected version, impact and minimal reproduction using fictional data. Do not attach real keys, personal snapshots or unredacted traces. Dependency vulnerabilities and upstream model/search behavior may require fixes from their respective maintainers.
