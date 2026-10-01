# Install and reload

Last updated: 2026-10-01.

From the clone root, `./install.sh` registers a native host manifest with the actual repo path, writes the global CLI wrapper, generates the user service, pins the discovered Node runtime in ignored `browser-bridge/node-runtime.sh`, enables the service, attempts user linger, and backs up/replaces installed skill folders. Requirements: Linux, Chrome, Node >=22. Do not run installation merely to inspect runtime: it writes user configuration and installed skills.

Load `browser-extension` via chrome://extensions, developer mode, Load unpacked. Verify ID `fkklpoodihheinpcjpldofbdbmabofcl`. CLI and native host launchers use their own directory; the generated service runs the discovered Node directly. Rerun installation after moving the clone or removing that runtime. The tracked service file is a template for the default `~/projects/antigravity-browser` path; generated installed service is authoritative.

```bash
systemctl --user is-active antigravity-browser-bridge.service
systemctl --user show antigravity-browser-bridge.service -p ExecStart -p MainPID
node browser-bridge/cli.js status
```

For an authorized daemon code update, finish tests, then `systemctl --user restart antigravity-browser-bridge.service`; host sockets reconnect. For an extension-only update, its watcher syntax-checks all extension JS and requests reload, or use `node browser-bridge/cli.js reload-extension`. A reload can reset session ownership/UID/debugger state. Active recording blocks reload; try again when it finishes. Restarting the daemon alone does not reload extension code. Editing mcp-server.js also requires restarting/reconnecting each external MCP client process; daemon/extension reload does not refresh its tool definitions.

If startup refuses a stale lock, inspect its exact path/PID and `ps` before removing anything. Do not unlink an active socket. Do not stop another client's recording to make an update convenient.

## See also

- [Daemon](../servers/daemon.md)
- [Recording gotchas](../gotchas/recordings.md)
- [Local access](../access/local-access.md)
- [Validation](validation.md)
