# Changelog

This file records user-visible changes to HarborDeck. Detailed release bodies live in `release-notes/` and are written in both Chinese and English.

## Unreleased

### 中文

- 暂无未发布的变更。

### English

- No unreleased changes.

## v1.4.9 — 2026-08-06

- Improved desktop bookmark cards with wider compact sizing, vertically centered icons, and up to three lines for long names while preserving dense layouts for large groups.
- Added a one-time Group Management action that assigns random icons only to older bookmarks and quick records that still lack one, then disappears when complete.
- Kept protected scenes unchanged unless they are unlocked and explicitly editable.
- Published matching 1.4.9 web and extension artifacts.

## v1.4.8 — 2026-08-06

- Added an immediate new-tab search field that preserves input while the application loads.
- Fixed extension updates for existing bookmarks and quick records, including stale search matches after editing.
- Completed wrap-around keyboard navigation between the search field and bookmark grid.
- Restricted navigable URLs to HTTP/HTTPS, removed integration response data leakage, hardened authentication throttling and proxy trust, and added CSP and security response headers.
- Updated runtime dependencies and published matching 1.4.8 web and extension artifacts.

## v1.4.7 — 2026-08-05

- Preserved bookmark form fields when switching scenes.
- Added searchable quick records when saving without a placement.
- Kept quick-record validation separate from normal bookmark slug rules and prevented stale save callbacks from replacing current feedback.

## v1.4.6 — 2026-08-03

- Search results temporarily expand matching bookmark groups and restore each group's previous collapsed state after the search is cleared.
- Published the HarborDeck 1.4.6 web image and extension release workflow.

## v1.4.5 — 2026-08-03

- Aligned homepage group cards that share a flex row and vertically centered short group titles.
- Restored the cache-first fast redirect path for the browser new-tab extension.
- Published the HarborDeck 1.4.5 web image and extension release workflow.

## v1.4.4-web — 2026-08-02

- Improved group rename dialog contrast and keyboard interaction.
- Added group rename from the homepage; the rename is scoped to the active scene.

## v1.4.3-web — 2026-08-02

- Added homepage group editing and active-scene-only rename behavior.

## v1.4.2-web — 2026-08-02

- Added ordered dragging for multiple selected bookmarks.
- Kept selection controls in a fixed overlay so entering multi-select does not change page height.

## v1.4.1-web — 2026-08-02

- Added duplicate bookmark with a prefilled creation form and a unique slug.

## v1.4.0-web — 2026-08-02

- Added group deletion, long-press multi-select, batch deletion, and Enter/Escape confirmation shortcuts.
- Deleting a reference preserves bookmarks still used by another scene.

## v1.3.0 — 2026-08-02

- Added dynamic scenes, independent scene groups, protected scenes, scene-targeted imports, and Synology Container Manager deployment from GHCR.

## v1.2.2–v1.2.6

- Refined the bookmark grid, long-name rendering, clock layout, network help, extension packaging, and release automation.
- Added configurable LAN/WAN probes and stable bookmark slugs.

## Release-note conventions

- Keep the newest version at the top.
- Use a filename that exactly matches the release tag, for example `release-notes/v1.4.4-web.md`.
- Include both `### 中文` and `### English` sections.
- Describe user-visible behavior, not implementation internals.
