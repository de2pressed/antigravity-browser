#!/usr/bin/env python3
"""Install only browser context/skills, backing up previous files outside discovery paths."""
import argparse, datetime, pathlib, shutil, hashlib, re
parser=argparse.ArgumentParser();parser.add_argument('--home',type=pathlib.Path,default=pathlib.Path.home());args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];home=args.home.resolve()
backup=home/'.gemini/config/context-backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
entry=f'''# Antigravity browser entry

Before browser work, read `{root}/integration/antigravity-global.md` and follow its task router. Read the active workspace's rules first. Reuse unchanged context already read in this conversation. Browser tabs stay in background; select exact profiles, verify outcomes, and close only this task's recorded scratch IDs. Tool access is not external-action authorization.
'''
plain_entry=entry
entry='<!-- antigravity-browser:start -->\n'+entry+'<!-- antigravity-browser:end -->\n'
for rel in ['.gemini/GEMINI.md','.gemini/config/GEMINI.md','.gemini/config/AGENTS.md']:
 target=home/rel;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():
  saved=backup/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
  old=target.read_text()
  # Preserve unrelated rules. Replace only the recognized legacy browser-only file or our own entry.
  if '<!-- antigravity-browser:start -->' in old and '<!-- antigravity-browser:end -->' in old:
   entry_to_write=re.sub(r'<!-- antigravity-browser:start -->.*?<!-- antigravity-browser:end -->\n?',lambda _:entry,old,flags=re.S)
  elif old == plain_entry or hashlib.sha256(old.encode()).hexdigest() == '88c074539bf1315b007582ae4c90bf6d6c11a146c7e551a57a2079fd6eccb86e':entry_to_write=entry
  else:entry_to_write=old+'\n\n'+entry
 else:entry_to_write=entry
 target.write_text(entry_to_write)
for name in ['browser-control','agent-browser','browser-google-sheets','spreadsheets-mastery','playwright-interactive']:
 target=home/'.gemini/config/skills'/name
 if target.exists() or target.is_symlink():
  saved=backup/'skills'/name;saved.parent.mkdir(parents=True,exist_ok=True);target.rename(saved)
 shutil.copytree(root/'skills'/name,target)
 # Copied skills live outside the repository: localize project-network links only.
 for source in (root/'skills'/name).rglob('*.md'):
  destination=target/source.relative_to(root/'skills'/name)
  def localize(match):
   label,link=match.groups()
   if link.startswith(('https://','http://','#','/','~')):return match.group(0)
   relative,separator,fragment=link.partition('#')
   resolved=(source.parent/relative).resolve()
   if resolved.is_relative_to(root/'skills'):return match.group(0)
   return '['+label+']('+str(resolved)+(separator+fragment if separator else '')+')'
  destination.write_text(re.sub(r'\[([^\]]*)\]\(([^)]+)\)',localize,source.read_text()))
print(f'Synced three browser entry points and five skills. Backup: {backup}')
