# Component map

Last updated: 2026-10-01.

| Component | Source | Connection | Brief / live status |
|---|---|---|---|
| Extension worker + cursor + popup | `browser-extension/` | Chrome APIs/CDP/native port | [Brief](servers/extension.md), [status](status/extension-status.md) |
| Local hub/auto-reloader | `browser-bridge/bridge-daemon.js` | Unix socket, PID lock | [Brief](servers/daemon.md), [status](status/daemon-status.md) |
| Native host per profile | `browser-bridge/host.js` | Native framed stdio; daemon socket | [Brief](servers/native-host.md), [status](status/native-host-status.md) |
| CLI + MCP | `browser-bridge/cli.js`, `mcp-server.js` | Socket / JSON-RPC stdio | [Brief](servers/clients.md), [status](status/clients-status.md) |
| Install/service/skills | `install.sh`, `systemd/`, `skills/` | User-level files and systemd | [Install workflow](workflows/install-and-reload.md) |
| Behavioral verification | `tests/*.test.js`, `.github/workflows/ci.yml` | Isolated child processes and mocks | [Validation workflow](workflows/validation.md) |

Runtime configuration: socket via `ANTIGRAVITY_SOCKET_PATH`, watcher source via `ANTIGRAVITY_EXTENSION_DIR`, daemon log via `ANTIGRAVITY_DAEMON_LOG`, Node runtime via local `node-runtime.sh` or `ANTIGRAVITY_NODE`. Defaults are documented in the component briefs. No credentials are required by the bridge itself; browser pages retain their existing authentication.

## See also

- [Global status](status/global.md)
- [Local access](access/local-access.md)
- [Ownership boundaries](gotchas/ownership-and-routing.md)
