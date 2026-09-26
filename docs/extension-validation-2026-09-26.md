# Extension implementation validation — 2026-09-26

## Pre-release verification: fixed identities and failure diagnostics, 1.4.21

The owner subsequently supplied both existing store IDs and the Edge public key. This supersedes the identity deferral in the earlier phase below. The following results were collected from the 1.4.21 candidate before release authorization. Publication is tracked by the Git tag, GitHub Release and Actions runs; store and production deployment checks remain separate.

- Chrome public 1.4.20 CRX downloaded from Google's update endpoint. Its signed header ID and publisher public-key-derived ID both match `mlnpanpmgplmlangfnokhelkhkfcpine`; the publisher signature verified. The supplied Edge RSA SPKI public key derives to `ogjfbhbheifoaidpfdbcbcbgfiblmnik`. The Edge listing/publication status is owner-reported, not independently fetched.
- Both channel identities now come from one shared JSON file. Manifest generation and packaging reject invalid keys, ID mismatch, channel mismatch and version mismatch. The server defaults to both standard IDs and accepts additional explicitly configured IDs. Ordinary pages and API responses keep their previous framing restrictions.
- The Mac screenshot shows the generic failed-verification message and old retry label. At least one manual address works, according to the owner. This does not identify the precise request failure or establish the installed extension version. Ubuntu read-only health requests returned HTTP 200 from both configured addresses; the WAN request took 236 ms, exceeding the former 200 ms default. That is a plausible false-timeout mechanism, not a Mac measurement or unique root cause.
- New installations default to a 1000 ms request timeout; existing saved values remain unchanged. Failed checks expose bounded per-address outcomes and elapsed time, without exception text or tokens. The prior explicit retry and cancellation protections remain in place.
- Full test suite: **329 passed, 0 failed**. ESLint, extension typecheck/build, server build and web build passed.
- Actual browser validation in Ubuntu Chromium **153.0.8010.12** used isolated profiles for each fixed identity and the real built server with a temporary configuration and dummy accounts. With an empty custom allowlist, both identities embedded successfully. Login moved API access from 401 to 200 without an integration token; a protected scene returned 403 before unlock and 200 afterward; logout restored 401. An unregistered extension origin was refused by browser CSP. No page JavaScript errors occurred.
- Separate browser regression passed for old unpacked identity → fixed Chrome identity: one-time sync migration, ignoring later sync addresses, actual download without token, cross-ID import preserving pending drafts, occupied-target refusal, bounded retry into an iframe once, and cancellation while typing. QA copies alone received localhost host permissions; distributed manifests did not.

Verification artifacts are retained outside the repository in the local task artifact directory `harbordeck-identity-20260926`, including signature/identity provenance, browser results and package checks. These are local validation results, not store approvals. Microsoft Edge itself, MacBook, actual store upgrades, physical cross-device synchronization and the production HTTPS proxy remain unverified. Existing production installations have not been changed.

## Earlier phase: identity-independent implementation, 1.4.20 development bundle

The identity-independent portion is implemented on top of `e742c3d` / package version `1.4.20`. The owner explicitly deferred standard identity selection. No fixed identity, server default allowlist, production deployment, or published release is claimed.

Implemented: one-time sync-to-local connection migration through a single background writer; device-local settings and matching cache/listener behavior; bounded explicit startup recovery with stale-result and input protection; validated local transfer of settings/preferences/drafts with token exclusion, occupied-target refusal, and no bookmark replay; a read-only exporter for old extension versions; bilingual UI and upgrade/rollback documentation.

Validation:

- Final complete test run: 321 passed, 0 failed, with `npm test -- --maxWorkers=4 --minWorkers=1`.
- ESLint and extension TypeScript/build passed. Web and server builds also passed; their implementation was not changed.
- An earlier unconstrained concurrent run hit the existing five-second timeout in `server/groupPreferences.test.ts`. The unchanged file passed separately (5 tests), and the complete suite passed with four workers. Test timeouts were not increased.
- Built extension exercised in Chromium 153.0.8010.12 on Ubuntu, using two fresh persistent profiles and different unpacked IDs. Only copied QA manifests received localhost host permissions. The delivered manifest has no added host permissions and no fixed key.
- Actual browser checks passed: legacy sync migration, ignoring later sync addresses, downloaded export without the fixture token, cross-ID import preserving pending drafts, occupied-target refusal, paused startup recovery into a fixture iframe exactly once, and input cancellation during retry. No page JavaScript errors were observed. A completion-message language mismatch found during this test was fixed and covered by a component regression.
- The source-level regressions also cover settings migration racing with saves, failed writes, pending submissions, language-sync partial failure, malformed files, concurrent draft saves, repeated recovery attempts, settings changes, offline/hidden states, final-read races, and current timeout selection.
- Package checked for the migration script/guide, a valid relative guide link, absence of NAS `@eaDir` metadata, and absence of a fabricated fixed identity or QA host permissions.

Development artifact: `harbor-deck-vdevelopment-local-settings-20260926.zip`, 129019 bytes. SHA-256: `49a52a8654f3e37937b7af4e05cbdd876424e2c6ede4ad8e1832fb3eb1ee7598`. Its manifest remains `1.4.20`; it is a development bundle, not a store update or a configuration-free embedding release. Follow the upgrade guide to preserve the current unpacked installation's identity and export before any identity change.

Still unverified: the reported MacBook incident's exact branch, Mac real-device behavior, real Chrome account synchronization across devices, the production proxy/login combinations, and standard/store identity compatibility. Fixture iframe success is not authentication or production CSP validation. The server still requires explicitly registered trusted extension IDs.
