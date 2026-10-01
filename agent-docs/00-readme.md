# Knowledge network conventions

Last updated: 2026-10-01.

Start at [AGENTS.md](../AGENTS.md), use its task router, then read only the needed briefs/statuses. This network covers the extension, daemon, native host, clients, installation, tests, and the shipped skills. It records useful operational facts rather than transcripts.

Architecture facts live in `servers/`; live observations live in `status/`; repeatable commands in `workflows/`; non-obvious failure modes in `gotchas/`; rationale in `decisions.md`; source pointers in `reference/`. Credentials never belong here.

Use `green` for verified working with no known issue in the tested scope, `yellow` for known limits or pending work, `red` for broken, `unknown` for unverified runtime, and `planned` for unimplemented work. A passing unit test alone cannot set a live browser component to green.

Every turn: mentally track touched files, discoveries, decisions. Every 2-3 turns: update relevant briefs/status/gotchas and decisions in a batch. Every session end: update global and changed component statuses and timestamps. Review [status conventions](status/README.md) weekly. Every file ends with relative See also links. Verify links after edits.

## See also

- [Entry point](../AGENTS.md)
- [Map](02-infrastructure-map.md)
- [Global status](status/global.md)
