# P2: Recording lifecycle

Last updated: 2026-10-01.

A 90-second MCP/CLI recording request used to traverse a daemon with a 30-second host timeout. Budgets now allow 90 seconds for batches and stop_recording, with a 95-second CLI wait. A batch whose total execution/finalization exceeds the budget can still time out without canceling work; use shorter batches and inspect outcomes.

Failed batches now stop/finalize recording in finally. Zero captured frames, missing ffmpeg, and finalization timeout return failure rather than claiming an MP4 exists. Worker finalization waits up to 45 seconds. Reload is refused while an active recording or finalization remains. A skipped watcher reload must be requested again once recording ends.

ffmpeg/libx264 is required only for recording. Temp frame directories are unique and removed on normal finalize/cancel paths; abrupt native host termination can leave files. Do not remove another client's active recording directory. Encoding duration/space and frame counts are not globally capped.

## See also

- [Native host](../servers/native-host.md)
- [Extension](../servers/extension.md)
- [Install/reload](../workflows/install-and-reload.md)
- [Native host status](../status/native-host-status.md)
