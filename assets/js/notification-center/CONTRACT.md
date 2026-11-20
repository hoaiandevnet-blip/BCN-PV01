# Trung tâm thông báo — 24/10/2026

Existing vanilla JavaScript app, globals and script tags, no build or new dependencies.
User wants asset warnings and application notifications at a globe beside the logged-in name.
Use actual authorized DashboardData snapshots, no sample data. Existing source files are integrated by root only.

## Shared model (root owns model.js)

`window.NotificationModel.create({storage, now})` returns:
- `setScope(username)` loads per-account state; empty scope clears in-memory state only.
- `reconcile(data)` accepts DashboardData.load result `{rows, stations}` and builds current warnings.
- `publish({id?, title, message, level?, target?})` records app events; identical messages within 8s deduplicate.
- `markRead(id)`, `markAllRead()`, `reload()` reloads storage for current account.
- `snapshot()` => `{items, unread, assetCount, storageAvailable}`.
- Every item: `{id, title, message, level: info|warning|danger, kind: asset|system,
  target: pageKey|'', createdAt: number, read: boolean}`. Sorted unread first, then latest first.
- Active warnings disappear when resolved/deleted, become unread again when content changes.
- Read markers persist per account on this browser; no claim of cross-device persistence.
- `DashboardData` provides `summarize`, `count`; scripts loaded before model.

## View (agent owns view.js and style.css)

`window.NotificationView.create({button, panel, onRead, onReadAll, onNavigate, onRefresh, icons})` returns:
- `update({items, unread, assetCount, storageAvailable, busy, error, updatedAt})` updates badge/list.
- `open()`, `close()`, `reset()` (close and clear; do not remove static button/panel).
- Button id `notificationToggle`: a globe immediately before `#userAvatar` in `.userbox`.
- Button markup: `<i data-lucide="globe" aria-hidden="true"></i>` and
  `<b data-notification-badge hidden></b>`. View maintains aria-label and aria-expanded.
- Panel id `notificationPanel`, appended to body (outside topbar overflow), initially hidden,
  role=dialog, aria-labelledby=notificationTitle, non-modal. Fixed overlay anchored top-right,
  responsive max-height/scroll, accessible Escape/outside-close, restore focus, keyboard friendly.
- View creates panel shell: Vietnamese heading, close, refresh, mark-all-read, search, all/unread filters,
  asset/system filter optional, paging/load more for 30 initial rows. Render text safely.
- Opening panel does NOT auto-read all. Clicking item calls onRead(id), onNavigate(target) if any.
  Navigation label describes module, not exact item detail. User can mark a single read without navigating.
- State updates must retain focus/search/scroll and avoid repainting identical lists every poll.
- Visible storage failure note, timestamp, loading/error (keep previous list when load fails).
- Zero message state, zero unread state; live status count without reading hundreds of messages aloud.
- CSS fully scoped to `.notification-*`, `#notificationToggle`, `#notificationPanel`.
  Must override broad topbar userbox span rules where necessary, work with light/dark existing themes.
  Keep the globe and unread badge static. Status popup animation is defined separately below.

## Controller/integration (root owns controller.js, app.js, dashboard*.js, index.html)

`window.NotificationCenter.start({username, navigate, refresh, icons})`, `reset()`,
`update(state)` receives dashboard snapshot state, `publish(event)`, `open()`.
Root wires actual login/toast/version/session warning events, per-account reset and storage listener.

## Shared notifications — 29/10/2026

`window.NotificationPopup.create({onOpen, durationMs = 6500})` returns `enqueue(items)`, `notify(message, options)`
and `reset()`. `getShared()` lazily creates the single popup used by the controller and all three toast adapters:
the application (`app.js`), Daily Reports and Smart Meeting. The popup sits at the top-right of the viewport.
The host moves into the active full-screen element and back to the body when full screen ends.
Server events with `eventType: 'asset-status'` or `kind: 'daily-report'` enter through `enqueue`;
their IDs deduplicate per session.
Each batch shows one card and its additional-update count. All events remain in the globe panel.
Cards slide in/out from the right, pause on hover/focus, and support reduced motion.
The shared popup plays a soft two-note chime when a card becomes visible. `popup/sound.js` loads
before `popup/view.js`, unlocks Web Audio on trusted pointer-down/up, click or key interaction, and exposes
`NotificationSound.play({isCurrent})`, `reset()`, `status()`, `subscribe()`, `test()`, `setEnabled()` and `setVolume()`.
Batches sound once, with a four-second minimum interval. New server updates sound on arrival even if
the visible card is paused for reading; showing that queued card does not sound a second time.
A context still resuming is awaited for at most
1.8 seconds; a dismissed notice or previous-account notice never sounds afterward. Old skipped sounds are not queued.
Unsupported or blocked audio leaves the visual notice working. The Settings page mounts `sound-controls.js` once per host through `renderSettings()`; the globe has no audio controls:
Vietnamese status, mute/unmute, volume and a direct test button. Mute/volume persist per browser origin in
`ttttch.notification-sound.v1`; browser autoplay permission still requires an interaction on a restored page.
The clearer default chime uses 60% of its bounded gain, without changing operating-system volume or site permissions.
Account/logout reset stops scheduled tones. The sound is synthesized locally and needs no external media file.
Transient `notify` options: `source`, `title`, `level` (info/warning/danger/success), `durationMs`,
and `openNotifications`. Text is rendered safely with textContent. Identical pending transient messages
coalesce; after dismissal the same message may be displayed again. Server and local cards share a FIFO queue
with a pending count, so the popup sources cannot cover each other. Close and Escape dismiss the current card.
Controller clears both queues when the account changes or logs out. Transient display does not itself write
notification history: the application's existing `notify` preference still controls `NotificationCenter.publish`.
Daily Reports business events continue arriving through the server feed and remain in the globe.
The feed includes own status updates for every account and other-account updates for admins only.
Feed items include `actorUsername` and `own`. Local inventory mutations refresh immediately;
visible-page polling runs every five seconds, with a follow-up if a mutation overlaps a request.
Dashboard sync polls throughout signed-in usage, reuses existing source loader/mutation channel.
Remove duplicate dashboard asset warning list and station warning; retain aggregate statistics/charts.

## Tests (agent owns notifications.test.mjs)

Routing: camera LPR/PTZ, TBOX and TTV-GLM-LPR/PTZ always use `assetCategoryManager`.
Server feed resolves legacy `tttcAssets` audit records using `assetModuleFor` and structured source fields.
Actual equipment catalogs and their attachments retain `tttcAssetCategories`; floor/station routes stay separate.
The view render signature includes `target`, so route corrections refresh existing notification controls.

Node built-in test runner + vm (same existing test style), no new dependency.
Test actual model: account isolation/persistence, stable asset identities on reorder, changed/resolved/reappearing
alerts, quantity, station pending, dedupe, mark-all across >30 items, storage errors/corrupt data.
Run `node --test assets/js/notification-center/notifications.test.mjs`.
Run `node --test assets/js/notification-center/popup/popup.test.mjs
assets/js/notification-center/popup/sound.test.mjs
assets/js/notification-center/integration.test.mjs` for the shared queue, audio lifecycle and adapters.
Run `node tests/system-notification-popups.mjs` for real login, unit validation, failed Daily Reports assignment,
meeting note save, desktop/tablet/phone layouts, dark theme, dismissal and sequential notifications.
Use `NOTIFICATION_BROWSER=msedge node tests/system-notification-popups.mjs` to check Microsoft Edge
(the default is Chrome). It creates and removes its own database and server; it does not use the running app's data.
`tests/notification-audio-browser.mjs` measures a nonzero signal using a real Web Audio analyser,
checks mute/reload/volume/test controls, and an asynchronous business notification without another click.

## Editing rules

Each exec writes one file; <=15KB per write. Use apply_patch. Never Delete+Add to replace a file.
One statement per line, ~120 columns. No nested agents, no parent messaging/polling; final report once.
