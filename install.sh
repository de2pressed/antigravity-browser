#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(command -v "${ANTIGRAVITY_NODE:-node}")"
"$NODE_BIN" -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || { echo 'Node.js >= 22 required' >&2; exit 1; }
export ANTIGRAVITY_NODE="$NODE_BIN"
export ANTIGRAVITY_INSTALL_ROOT="$REPO_DIR"
mkdir -p "$HOME/.local/bin" "$HOME/.config/google-chrome/NativeMessagingHosts" "$HOME/.config/systemd/user"
# Bash-quote the actual clone location and runtime, including spaces.
{
  printf '#!/usr/bin/env bash\nexec %q %q "$@"\n' "$NODE_BIN" "$REPO_DIR/browser-bridge/cli.js"
} > "$HOME/.local/bin/agy-browser"
chmod +x "$HOME/.local/bin/agy-browser" "$REPO_DIR/browser-bridge/"*launcher.sh
# Use JSON serialization rather than interpolating unescaped paths.
"$NODE_BIN" <<'JS'
const fs = require('fs');
const path = require('path');
const root = process.env.ANTIGRAVITY_INSTALL_ROOT;
const home = process.env.HOME;
const quote = value => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%') + '"';
fs.writeFileSync(path.join(home, '.config/google-chrome/NativeMessagingHosts/com.google.antigravity.browser.json'), JSON.stringify({
  name: 'com.google.antigravity.browser', description: 'Antigravity Browser Bridge Native Host',
  path: path.join(root, 'browser-bridge/host-launcher.sh'), type: 'stdio',
  allowed_origins: ['chrome-extension://fkklpoodihheinpcjpldofbdbmabofcl/']
}, null, 2) + '\n');
const service = fs.readFileSync(path.join(root, 'systemd/antigravity-browser-bridge.service'), 'utf8')
  .replace(/^ExecStart=.*$/m, 'ExecStart=' + quote(process.execPath) + ' ' + quote(path.join(root, 'browser-bridge/bridge-daemon.js')));
fs.writeFileSync(path.join(home, '.config/systemd/user/antigravity-browser-bridge.service'), service);
// Chrome does not inherit the caller's interactive shell PATH; pin the discovered runtime locally.
fs.writeFileSync(path.join(root, 'browser-bridge/node-runtime.sh'), 'ANTIGRAVITY_NODE=' + "'" + process.execPath.replace(/'/g, "'\\''") + "'\n");
JS
systemctl --user daemon-reload
systemctl --user enable --now antigravity-browser-bridge.service
if command -v loginctl >/dev/null 2>&1; then
  if loginctl enable-linger "${USER:-$(id -un)}"; then echo 'User linger enabled'; else echo 'User linger was not enabled'; fi
fi
SKILLS_DIR="$HOME/.gemini/config/skills"
mkdir -p "$SKILLS_DIR"
for skill in browser-control browser-google-sheets spreadsheets-mastery agent-browser playwright-interactive; do
  if [[ -e "$SKILLS_DIR/$skill" || -L "$SKILLS_DIR/$skill" ]]; then
    mv -- "$SKILLS_DIR/$skill" "$SKILLS_DIR/$skill.backup.$(date +%s%N)"
  fi
  cp -a -- "$REPO_DIR/skills/$skill" "$SKILLS_DIR/$skill"
done
# Copies live outside the checkout: localize links into project docs/integration.
"$NODE_BIN" <<'JS'
const fs = require('fs'), path = require('path');
const root = process.env.ANTIGRAVITY_INSTALL_ROOT, skills = path.join(root, 'skills');
for (const name of ['browser-control','browser-google-sheets','spreadsheets-mastery','agent-browser','playwright-interactive']) {
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const source = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(source); continue; }
      if (!entry.name.endsWith('.md')) continue;
      const content = fs.readFileSync(source,'utf8').replace(/\[([^\]]*)\]\(([^)]+)\)/g, (original,label,link) => {
        if (/^(https?:|#|\/|~)/.test(link)) return original;
        const [relative,fragment] = link.split('#'), resolved = path.resolve(path.dirname(source), relative);
        return resolved.startsWith(skills + path.sep) ? original : `[${label}](${resolved}${fragment ? '#' + fragment : ''})`;
      });
      fs.writeFileSync(path.join(process.env.HOME,'.gemini/config/skills',name,path.relative(path.join(skills,name),source)),content);
    }
  }
  walk(path.join(skills,name));
}
JS
printf 'Installed from %s\nLoad browser-extension in Chrome; check with agy-browser status\n' "$REPO_DIR"
