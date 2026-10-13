# Extension capture and direct-start recovery validation

This change was implemented and tested on top of `d80585c` (1.4.26), initially without publication. After reviewing the results and the remaining Mac validation boundary, the user authorized the extension-only 1.4.27 release and requested ZIPs for their own store submission. Existing README and older review-document changes were present before this task and remain outside the release commit. No production deployment, store submission, or replacement of the daily extension is included.

## Behavior

The capture popup searches the already loaded scene/group paths, preserves per-scene selections across filtering, exposes explicit quick-record destinations, and keeps the save button outside the scrolling content. Empty optional fields collapse; existing notes and secondary URLs remain available. Removed draft destinations block submission until explicitly repaired. An uncertain submission stays blocked until the user checks it and explicitly resumes editing; this action does not send another POST.

Direct new tabs allow worker startup overhead separately from the configured network probe, perform one delayed recovery attempt after an initial transient failure, and respond to network/visibility recovery events. Fresh, matching worker publications can complete a late request. Settings changes, page disposal and composition guard a single navigation path. Health checks require JSON `{ "ok": true }` and bound permission lookup and body parsing as well as headers.

Scene membership, current-scene bookmark search, instance-keyed drafts, extension identities, addresses, tokens and the default opening-mode selection retain their existing contracts. No server API or persistence migration was added.

## Automated checks

- `npm test`: 65 files, 396 tests passed.
- `npm run lint`: passed.
- `npm run build`: Web and server TypeScript/production builds passed.
- `npm run build:extension`: Chrome build passed.
- `EXTENSION_BROWSER=edge npm run build:extension`: Edge build passed. The default Chrome manifest was regenerated afterward without changing compiled code.
- `git diff --check`: passed.

New coverage includes full-path group matching, stable browsing expansion, selection preservation, keyboard/IME handling, exact multi-scene POST bodies, quick-record intent, removed draft targets, uncertain writes, worker startup deadlines, bounded retries, late publications, settings invalidation, disposal, HTML/malformed health responses, stalled permissions and stalled response bodies.

Vite continues to report a large shared application chunk. This is a build warning, not a failed compilation or a claim of bundle-size optimization.

## Browser checks

The actual extension frontend modules were run in the Codex in-app Chromium browser with an isolated Chrome/API fixture and synthetic data: 84 groups distributed as 51/6/16/11. No production bookmark API or credential was used. This verifies rendered UI and page behavior; it is not an installed Chrome-extension service-worker or native Mac test.

Verified flows:

1. Chinese and combined scene/group search; Enter selects without POSTing.
2. Home and Dewu selections survive a no-results filter; one save sends both exact IDs once.
3. A removed group blocks saving while retaining text and notes; choosing its replacement unblocks it.
4. Long restored notes and four selected locations keep the save button inside the 600px panel. The initially clipped status layout was repaired and rechecked; save-button bottom was 579px, panel bottom 592px.
5. Read-only uncertain-write verification performs no POST; explicit resume clears the pending marker without sending data.
6. A worker response delayed by 1400ms navigates automatically with one request.
7. A cache success published after 3400ms, beyond the request deadline, navigates without manual Retry and preserves `中文恢复测试`; request count remains one.
8. A transient initial failure recovers automatically on the second request.
9. Persistent offline state stops at two requests. Manual Retry performs one further request and preserves input.

The local fixture and command logs are in `/tmp/harbor-extension-qa/` for this session. Unit/integration checks above are retained in the repository and can be rerun independently of that temporary fixture.

## Remaining boundary

Mac daily Chrome installation, native extension-popup sizing, real service-worker suspension/wakeup, real network switching and native Chinese IME still need testing on that device. The current environment exposes an in-app browser, not the user's Mac Chrome session. Isolated results do not replace that device validation. The user subsequently authorized publishing the extension release and ZIPs with this boundary retained; publishing packages does not establish Mac validation or store approval.

## 1.4.27 release packaging

The release candidate reran all 396 tests and lint successfully. Chrome and Edge builds and their four ZIPs passed `verify-packages.py`: versions are 1.4.27, unpacked IDs match the existing listings, store manifests contain no `key`, and each channel's remaining files are identical across its store/unpacked pair. Required manifest and HTML resources are present; ZIPs exclude NAS metadata. An initial lint scan overlapped a build replacing `dist` files and hit ENOENT; the final successful scan ran after packaging finished.

The `v1.4.27-extension` tag parses to `publish_extension=true` and `publish_web=false`. The GitHub workflow publishes the four extension assets; its Docker build/push steps are skipped. Store submission remains with the owner. Release packaging logs and local ZIP checksums are in `/tmp/harbor-extension-release-1.4.27/` for this session.
