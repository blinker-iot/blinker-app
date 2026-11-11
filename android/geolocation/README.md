# Maintained Android one-shot location

This replaces only the Android implementation of `@capacitor/geolocation`
8.2.2. The JS package, plugin name/class, SDK versions and watch API remain
unchanged. `settings.gradle` selects this module
after Capacitor's generated settings; `cap sync` does not edit it or node_modules.

Sources: Ionic's MIT-licensed Capacitor plugin 8.2.2 (the two Kotlin files and
`LICENSE.capacitor-geolocation`), and iongeolocation-android 2.2.2 at the commit
and original hashes in `upstream-core.json` (`LICENSE.iongeolocation`). The Gradle
gate checks the installed plugin version and original plugin source hashes before
compilation. Review this maintenance delta explicitly before changing versions.

The current-position path uses Android's available NETWORK/GNSS providers, not
GMS. Each enabled, permission-eligible provider is registered at most once in the
same user request, at a 1000ms interval and under the existing owner deadline.
This bounded acquisition is not the public watch API: there is no retry, and
the first valid fresh fix cancels all registrations before one terminal reply.
With maximumAge=0 a cached fix before request start is ignored within the same
registration, never re-requested. Invalid/old results cannot reset the deadline.
Only coarse permission never requests GNSS. Network backend availability still
depends on the OS/ROM; the API does not guarantee a Google-free network backend.

The single current-position owner has an elapsed-realtime
deadline starts before permission acquisition, late permission/results cannot
start or settle another request, and one terminal callback cancels every provider.
`requestId`
and `cancelCurrentPosition({requestId})` link an explicit App abort to that owner.
The cancel acknowledgement is not the original request's terminal result.
There is no retry, IP/third-party SDK fallback or background tracking. One-shot
location does not launch Google settings dialogs or initialize its client. The
vendored Ionic controller remains for the unchanged watch API only.

Results preserve the actual source (`system-network`/`gnss`), accuracy, measurement
time and WGS84 coordinate system; absent metadata is never invented. They are
only map draft candidates: device position still requires explicit user save.

For a finite operator diagnosis only, Android's standard
`log.tag.BlinkerLocation=DEBUG` enables at most 24 fixed stage records per request.
Default is off. Records contain only the generated request ID, stage and relative
elapsed time, never coordinates, user/device IDs or raw errors. Restore the prior
log property after the observation. System provider callbacks and cleanup are
observed separately from plugin resolve/reject and JS receipt.

The deadline is a single logical budget, not a hard real-time guarantee while
Android's main thread is suspended. Token cancellation is a request to the provider,
not proof that all physical location hardware has stopped. A valid location is
not guaranteed indoors or without a usable provider. Failed acquisition must
still return one error instead of leaving the App locked until process restart.

Finite native regression: `:capacitor-geolocation:testDebugUnitTest --tests
com.capacitorjs.plugins.geolocation.CurrentPositionRequestTest --offline`.
