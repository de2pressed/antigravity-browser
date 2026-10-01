# Native messaging host and recordings

Last updated: 2026-10-01.

Chrome launches `host-launcher.sh` from its registered NativeMessagingHosts manifest. The launcher uses its own directory and the locally selected Node runtime. `host.js` reads JSON with 4-byte little-endian length framing from stdin, and writes the same framing on stdout. Logs go to `/tmp/antigravity-native-host.log` (override `ANTIGRAVITY_NATIVE_LOG`); stdout must contain protocol frames only.

Inbound frames are capped at Chrome's 64 MiB limit, outbound host-to-extension messages at 1 MiB. Oversized requests report a daemon error instead of breaking Chrome's native port. Unix socket decoding uses UTF-8 stream handling, preserving multibyte characters split between chunks. The host reconnects to the daemon every second and sends a 20-second extension keepalive.

Profile identity comes from Chrome identity API/handshake, or local Preferences only when an ancestor explicitly supplies `--profile-directory`. Do not infer Default when it is absent. Cached profile metadata with no trusted provenance is not reused. Website cookies/titles do not prove browser profile identity.

Recording flow: worker sends recording_init; host creates a unique temporary directory; screencast JPEG frames are written with timestamps; recording_finalize creates ffconcat input and spawns ffmpeg/libx264. The host pads odd dimensions and emits MP4 metadata only after successful encoding. Missing ffmpeg and zero frames return failure. Temporary frames are removed on finalize/cancel paths. Invalid recording IDs or frame indices are rejected. Default MP4 outputs are under `/tmp/antigravity-recordings`.

Recording duration/space are not quota-managed. Long captures can consume disk; frame traffic and synchronous filesystem work can become a bottleneck. Abrupt process death can leave temporary files; inspect exact directories before removing them.

## See also

- [Status](../status/native-host-status.md)
- [Recording gotchas](../gotchas/recordings.md)
- [Daemon](daemon.md)
- [Extension](extension.md)
- [Access](../access/local-access.md)
