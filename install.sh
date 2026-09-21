#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "=== Installing Antigravity Browser Bridge ==="
echo "Repo Directory: $REPO_DIR"

# 1. Global CLI wrapper
mkdir -p "$HOME/.local/bin"
cat << 'EOF' > "$HOME/.local/bin/agy-browser"
#!/usr/bin/env bash
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v24.16.0/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
exec node "$HOME/projects/antigravity-browser/browser-bridge/cli.js" "$@"
EOF
chmod +x "$HOME/.local/bin/agy-browser"
echo "✔ Installed CLI: ~/.local/bin/agy-browser"

# 2. Chrome Native Messaging Host
NATIVE_HOSTS_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
mkdir -p "$NATIVE_HOSTS_DIR"
cat << EOF > "$NATIVE_HOSTS_DIR/com.google.antigravity.browser.json"
{
  "name": "com.google.antigravity.browser",
  "description": "Antigravity Browser Bridge Native Host",
  "path": "$REPO_DIR/browser-bridge/host-launcher.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://fkklpoodihheinpcjpldofbdbmabofcl/"
  ]
}
EOF
echo "✔ Registered Chrome Native Messaging Host manifest"

# 3. Systemd User Service
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_USER_DIR"
cp "$REPO_DIR/systemd/antigravity-browser-bridge.service" "$SYSTEMD_USER_DIR/"
systemctl --user daemon-reload
systemctl --user enable --now antigravity-browser-bridge.service
echo "✔ Enabled & started systemd user service: antigravity-browser-bridge.service"

# 4. Enable user linger
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" || true
  echo "✔ User linger enabled for 24/7 boot auto-start"
fi

# 5. Link Skills into Antigravity
SKILLS_DIR="$HOME/.gemini/config/skills"
mkdir -p "$SKILLS_DIR"
for skill in browser-control browser-google-sheets spreadsheets-mastery agent-browser playwright-interactive; do
  if [ -d "$REPO_DIR/skills/$skill" ]; then
    rm -rf "$SKILLS_DIR/$skill"
    cp -r "$REPO_DIR/skills/$skill" "$SKILLS_DIR/"
    echo "✔ Synced skill: $skill"
  fi
done

echo ""
echo "=== Installation Complete! ==="
echo "Extension folder: $REPO_DIR/browser-extension"
echo "Load unpacked in Chrome (chrome://extensions) with Developer Mode enabled."
echo "Test the CLI via: agy-browser status"
