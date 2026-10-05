// Chrome reserves native new-tab focus for the omnibox. Open our local app as
// an ordinary extension document before rendering any UI or loading settings.
// This is one local replacement, with no server probe, intermediate cache view,
// extra history entry, or redirect when the app's data changes.
window.location.replace(new URL('newtab.html', window.location.href).href)
