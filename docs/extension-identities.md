# Standard extension identities

The public identity source is `shared/extension-identities.json`. The server reads the default IDs from it; manifest generation and packaging validate each public key against its declared ID. Private keys are neither required nor stored.

| Channel | Store / CRX ID | Verification on 2026-09-26 |
| --- | --- | --- |
| [Chrome](https://chromewebstore.google.com/detail/mlnpanpmgplmlangfnokhelkhkfcpine) | `mlnpanpmgplmlangfnokhelkhkfcpine` | Public 1.4.20 CRX retrieved from Google's update endpoint; publisher proof matched the ID and its SHA-256 signature verified |
| [Edge](https://microsoftedge.microsoft.com/addons/detail/ogjfbhbheifoaidpfdbcbcbgfiblmnik) | `ogjfbhbheifoaidpfdbcbcbgfiblmnik` | Owner-supplied public key parsed as RSA SPKI and its derived ID matched; store publication details supplied by the owner |

The Chrome CRX SHA-256 is recorded in the implementation audit. The ID is derived from the first 16 bytes of the public-key SHA-256, with hexadecimal digits mapped to a–p. A public key identifies a browser extension origin; it is not an administrator credential or proof that arbitrary unpacked code comes from the store publisher.

## Build and package

```sh
npm run build:extension
npm run package:extension

EXTENSION_BROWSER=edge npm run build:extension
EXTENSION_BROWSER=edge npm run package:extension
```

Both operations must use the same channel. Chrome remains the default and keeps the existing `harbor-deck-<tag>.zip` filename. Edge uses `harbor-deck-<tag>-edge.zip`. Builds are sequential because they share `extension/dist`. Missing or mismatched identity material, unknown channels, wrong-channel packaging and version mismatches fail before packaging replaces an existing artifact. The release workflow builds and attaches both channels when the tag includes an extension release.

Use the matching package when replacing a store or unpacked installation. Same-channel unpacked packages keep their ID across paths; the two store channels intentionally keep distinct IDs. An old unpacked installation may have a different ID and requires the data-transfer procedure before replacement. Chrome can treat the same ID from another distribution source as the same extension, so do not assume store/unpacked copies can coexist in one profile; keep a recoverable export before switching channels or distribution methods.

## Server behavior and upgrade

Starting with 1.4.21, effective allowed sources are the two standard IDs plus valid entries in `HARBORDECK_TRUSTED_EXTENSION_IDS`. Empty configuration now means no extra IDs. Only the existing `/` and `/index.html` HTML responses with `embedded=1` use this policy. Ordinary pages and API responses keep their existing embedding restriction. Invalid or wildcard IDs are rejected.

The new default does not grant login, expose locked scenes, add broad host permissions, or use the integration token as a login credential. Old servers need an upgrade or one manual standard-ID registration. Custom extensions retain their explicit allowlist path. Reverse proxies that add a restrictive CSP may still block embedding; inspect the final response and verify the actual browser flow.

Standard identity, authentication and CSP behavior were exercised with both identities in isolated Chromium profiles and a real temporary server. Microsoft Edge itself, MacBook, actual store upgrades and production proxy behavior remain separate validation items. Publishing the release and its ZIPs does not deploy a production server or submit a store update.
