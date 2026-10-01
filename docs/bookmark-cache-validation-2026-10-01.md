# Bookmark cache validation — 2026-10-01

The 1.4.22 changes are based on `954d746` (published 1.4.21). These results were collected before release authorization. Publication and build status are tracked by the `v1.4.22` tag, GitHub Release and Actions runs; this report does not claim store submission, production deployment or Mac/Edge-device acceptance.

## Implementation and scope

One filtered snapshot per address uses existing browser storage: localStorage on the web, chrome.storage.local in the extension. Both surfaces share validation and a read-only renderer. Only ordinary scenes' referenced bookmarks and quick records are persisted. No credentials, protected content, arbitrary configuration, offline write queue, IndexedDB, Service Worker, periodic polling or external synchronization service is introduced.

Reads are bounded to five seconds including body decoding. Auth and navigation startup can show the local copy; existing lists survive failed background reads. Successful empty/deleted content replaces old snapshots. Mutations fail when explicitly offline instead of being replayed after reconnect. Existing draft/concurrent-write protections remain in use.

Extension frames exchange snapshots only after source, origin and per-frame handshake validation. Chromium may supply a null source on privileged messages; the web side then checks the actual extension ancestor. A readiness handshake handles document/effect ordering. See [MDN's extension messaging notes](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#using_window.postmessage_in_extensions). Incoming changes are serialized and guarded against cache clearing, login and settings changes.

Real browser testing exposed an existing server issue: static HTML 304 responses omit Content-Type and were consequently assigned a different, prohibitive framing policy. Exact HTML entry paths now retain their original embedding policy during revalidation; ordinary pages and other paths remain restricted. This does not establish the root cause of the earlier Mac startup prompt, which preceded iframe loading.

## Automated checks

The complete suite passes 348 tests, including the prior 329 tests and new coverage for snapshot filtering, protected/unreferenced content exclusion, malformed/unsafe/wrong-address records, empty/deleted content, quota failures, delayed responses, account and cache-clear ordering, HTTP without crypto.randomUUID, extension settings pruning, offline boot, read deadlines, search/group preservation, message-source validation and HTML 304 policy. ESLint and web/server/Chrome/Edge builds pass.

The existing suite continues to cover bookmark editing and concurrent revisions, retained drafts, scene passwords and access isolation, login, backup behavior, settings migration, cross-ID transfer and startup cancellation. Unit coverage is not a claim that every production or physical-device combination has been exercised.

## Actual browser checks

Ubuntu Chromium 153.0.8010.12 uses isolated profiles, both fixed Chrome/Edge identities, the actual built application and temporary server configurations with dummy accounts. Only copied QA manifests receive local fixture permissions; distributed packages retain optional user-granted host permissions.

Checks cover authenticated snapshot creation; full API failure with a loaded web shell; delayed cold reads and search preservation; a non-secure HTTP hostname; completely offline extension tabs; reconnect without replacing input; cached styles and manual full-page search handoff; actual server deletion and restoration; spoofed parent/frame messages; cache clearing without settings loss; address changes; embedded and direct modes; authentication expiry and relogin; and explicit 401 after an already authenticated page. The published 1.4.21 Chrome extension is separately exercised against the new web/server build for login and bookmark display.

Snapshots and tested pages contain no protected fixture bookmarks. Screenshots were inspected for the cached web and extension views. Browser artifacts, scripts and package hashes are retained in the local task artifact directory `harbordeck-cache-20261001`; the final per-channel result files distinguish fixed Edge identity testing in Chromium from Microsoft Edge itself.

## Remaining boundary

No real MacBook, Microsoft Edge executable, production HTTPS reverse proxy, browser store update, or production data operation was performed. Direct web visits still need application resources to load. Browser-managed storage can be cleared or unavailable; cached ordinary data cannot observe remote revocation while offline. These limits remain explicit in the upgrade guide.
