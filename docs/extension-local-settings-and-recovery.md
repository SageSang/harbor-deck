# Extension local settings, transfer, and startup recovery

Version 1.4.21 adds device-local connection settings and an explicit recovery action on the new-tab startup page. It pins the Chrome and Edge store identities in separate builds. The corresponding server permits both by default. Older servers still require explicit registration or an upgrade. See [identity and build details](extension-identities.md).

## Upgrade the server and extension separately

The server can be upgraded first while store review is pending. Existing extensions retain their APIs and behavior; keep any custom trusted IDs needed by old unpacked installations. The existing Chrome and Edge store IDs are included in the server defaults regardless of extension version. Server restart requires signing in and unlocking protected scenes again.

Local connection settings, transfer tools, explicit startup recovery and detailed probe outcomes take effect when the extension is updated. A server-only upgrade cannot change an old extension's startup timeout or retry behavior. GitHub ZIP availability does not mean a store update has been submitted or approved. Back up the server configuration before upgrading.

## Upgrade on the same extension ID

Update the existing unpacked installation in its existing directory and reload it. Do not uninstall it first. On first use, the background worker copies the locally available old sync connection settings to local storage once. Addresses, token, opening mode, probe timeout, and their revision then belong to this installation; later Chrome sync updates cannot overwrite them. Language keeps its existing sync behavior.

Check the addresses after upgrading. If Chrome had already synchronized another device's address before this upgrade, the extension cannot reconstruct the earlier device-specific value. The original sync values remain available for recovery and are not rewritten during connection migration.

## Transfer to another extension ID

Keep the old installation until the new one has been checked.

1. In the old installation, use **Export transfer file** on the options page. This exports saved connection settings, preferences, legacy and per-instance drafts, and pending submission details. Save any form edits before exporting. Tokens and address-probe caches are excluded.
2. For an old version without the export button, open that extension's options page and its DevTools console. Review and run [`export-legacy-settings.js`](../extension/tools/export-legacy-settings.js) there. The script only reads known extension storage keys and downloads a JSON file; it does not change storage or send data to a server. Do not run it on an ordinary website.
3. Import the JSON in an empty new installation. Existing connection settings, preferences, or drafts cause a refusal; the importer does not merge or erase them. Invalid files, unsupported versions, and files over 5 MB are refused.
4. Verify addresses, opening mode, preferences, draft contents, and draft instance ownership. Re-enter the token if the old installation used one, then use **Save** to grant the address permissions. Sign in and unlock scenes normally when needed.
5. Pending bookmark submissions stay pending. Inspect whether the earlier request succeeded before submitting anything again. Import itself does not issue bookmark writes.

Import writes all durable local data together, under a browser-provided lock shared with settings and draft writers. It does not introduce a database, background scheduler, or persistent lock records. Language sync happens afterward; if it fails, the UI explicitly reports that the data was imported and asks you to select the language again. Do not repeat the entire import in that case.

The migration file contains private addresses and draft content even though it omits the token. Keep it locally and remove the file when no longer needed. Do not remove the old extension merely because a download or import reported success.

## Continue from a paused new-tab page

A new tab can pause after timeout, hiding, offline detection, input, or an explicit address failure. These conditions still stop automatic navigation. The 120 ms warm-path guard and earliest 180 ms cold navigation are retained. New installations now default to a 1000 ms probe timeout (1200 ms cold budget), because a working WAN health request can exceed the former 200 ms timeout. Existing saved values are preserved; increase them in Settings if appropriate.

Use **Check again and open** to start a new bounded attempt using current settings. A verified address opens once. Failure, missing permissions, or timeout leaves manual links available. A late result from an earlier attempt cannot complete the new attempt. Typing, hiding, going offline, or changing settings during recovery cancels it; existing typed text is retained. Simply becoming visible or online does not restart a cancelled automatic navigation.

This improves recovery from the observed startup-page behavior. The supplied screenshot confirms the generic failed-verification message, and the owner reports that at least one manual address opens. The exact Mac browser/version, saved timeout and underlying failure remain unconfirmed; this is not proof of a Mac-specific root cause or fix.

## Recovery and release boundary

Before rolling back, export the current local settings and drafts. Older versions read sync connection settings, so their values may be stale; re-enter the device's correct addresses and token rather than copying them automatically back to sync for every device.

The standard public identities have been verified and implemented. Real Mac, Microsoft Edge itself, multiple physical devices, and the production HTTPS proxy still need validation before claiming full compatibility. Linux Chromium tests use the real built server and temporary accounts; they do not replace those device and deployment checks.

Failed address checks now show separate primary/secondary outcomes: request timeout, HTTP error code, network request failure, or missing/failed permission checks, with elapsed time. These are the most recent probe results, not a complete network diagnosis. No token, exception text or search term is added to diagnostics.
