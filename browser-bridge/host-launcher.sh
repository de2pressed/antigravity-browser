#!/usr/bin/env bash
export PATH="/home/jayant/.nvm/versions/node/v24.16.0/bin:$PATH"
exec /home/jayant/.nvm/versions/node/v24.16.0/bin/node /home/jayant/.gemini/antigravity/browser-bridge/host.js "$@"
