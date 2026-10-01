# Unix socket daemon

Last updated: 2026-10-01.

Source: `browser-bridge/bridge-daemon.js`. Default socket `/tmp/antigravity-browser-bridge.sock` (mode 0600). A sibling `.lock` file records the PID and serializes startup/stale socket recovery. A live duplicate daemon exits without deleting the active socket. Cleanup removes only socket/lock inodes owned by that process.

Hosts register PID and profile metadata, then receive request IDs with methods/params. Profile routing supports an exact email/name/profileDir/host ID or a unique substring. Multiple profiles require explicit selection for `new_tab`. Tab requests query connected profiles and reject missing, invalid, or colliding IDs; they do not fall back to another profile. A profile query failure prevents assuming uniqueness.

Host RPC defaults to 30 seconds; `run_actions` and `stop_recording` use 90 seconds. Disconnects reject pending requests immediately. Replacing a host socket with the same PID preserves the replacement registration. Reload and cleanup report failed profiles rather than claiming all succeeded. `list_tabs` fails explicitly on partial profile-query failure instead of returning an incomplete list as complete.

The watcher resolves the repository extension path and debounces edits for 500ms. It syntax-checks all extension JS files with the running Node executable using argument arrays, then requests reload. The worker rejects reload while recording/finalization is active. The watcher logs failures; it does not retry a skipped reload automatically.

Default log `/tmp/antigravity-daemon.log`. Logs are local diagnostics and may include profile metadata. They do not prove which website account is authenticated. Tests override socket/log/watcher paths.

## See also

- [Status](../status/daemon-status.md)
- [Routing gotchas](../gotchas/ownership-and-routing.md)
- [Install/reload](../workflows/install-and-reload.md)
- [Native host](native-host.md)
- [Decisions](../decisions.md)
