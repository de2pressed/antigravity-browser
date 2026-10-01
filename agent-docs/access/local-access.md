# Local access index

Last updated: 2026-10-01. No credentials stored here.

Bridge operation needs the user's logged-in Chrome extension and local filesystem permission; it does not need API keys, password exports, or copied cookies. Browser authentication remains in Chrome profiles. Validate target profile/page identity before authorized account work.

- Repository: `/home/jayant/projects/antigravity-browser`.
- Legacy extension/bridge links: `~/.gemini/antigravity/browser-extension`, `~/.gemini/antigravity/browser-bridge`.
- Chrome native host manifest: `~/.config/google-chrome/NativeMessagingHosts/com.google.antigravity.browser.json`.
- User service: `~/.config/systemd/user/antigravity-browser-bridge.service`.
- CLI wrapper: `~/.local/bin/agy-browser`.
- Installed skills: `~/.gemini/config/skills/`.
- Locally selected runtime: ignored `browser-bridge/node-runtime.sh`.
- Browser profiles remain under Chrome's user data directory; Preferences identity is read locally by the native host only with an explicit profile-directory ancestor argument. Do not copy Preferences or profile contents into docs.

Private material, if ever needed, belongs outside git or in ignored `keys/`, `env-files/`, `creds/`; this project currently needs no secret files there. Existing public extension key material is identity metadata, not login access.

## See also

- [Install workflow](../workflows/install-and-reload.md)
- [Ownership/routing](../gotchas/ownership-and-routing.md)
- [Map](../02-infrastructure-map.md)
