# Decisions

Last updated: 2026-10-01.

## 2026-10-01: Fail explicit routing errors

Unknown/ambiguous targets must fail because a convenience fallback can mutate the wrong Chrome profile. New-tab requests with multiple profiles require selection. Browser identity comes from Chrome identity.email or explicitly located Preferences; page accounts are distinct.

## 2026-10-01: Separate interaction permission from cleanup eligibility

Existing claims grant interaction, not disposable-tab status. A second set stores created provenance. Legacy session data cannot prove creation, so bulk cleanup preserves it. Per-client ownership/session leases remain future work, since the existing transport has no trustworthy caller session identity.

## 2026-10-01: Serialize tab requests and reject cross-tab batches

Batches execute as one queued request; separate requests for the same tab wait. Cross-tab actions must be separate routed requests because one native host cannot execute another profile's tab action. This avoids bypassing safety and routing through per-action overrides.

## 2026-10-01: One paste path and honest result scope

Use one synthetic clipboard event; native insertText handles ordinary editors when it is not consumed. Avoid overwriting OS clipboard or dispatching Ctrl+V after a handled event. Rich editor consumption still requires application read-back.

## 2026-10-01: Portable launchers and dependency-free regression tests

Use launchers relative to their own directory, install-time Node selection, and Node built-in test/VM APIs. Export canonical MCP tools and enforce schema parity. No npm dependencies, extra daemon framework, or automatic knowledge-writing job is introduced.

## See also

- [Entry point](../AGENTS.md)
- [Routing gotchas](gotchas/ownership-and-routing.md)
- [Automation gotchas](gotchas/automation-accuracy.md)
- [Audit](../docs/audit-2026-10-01.md)
