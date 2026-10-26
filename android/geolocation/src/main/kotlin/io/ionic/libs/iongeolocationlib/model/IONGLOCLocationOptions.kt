package io.ionic.libs.iongeolocationlib.model

/**
 * Data class representing the options passed to getCurrentPosition and watchPosition
 *
 * @property timeout The maximum time in **milliseconds** to wait for a new location fix before
 *  throwing a timeout exception.
 * @property maximumAge Maximum acceptable age in **milliseconds** of a cached location to return.
 *  If the cached location is older than this value, then a fresh location will always be fetched.
 * @property enableHighAccuracy Whether or not the requested location should have high accuracy.
 *  Note that high accuracy requests may increase power/battery consumption.
 * @property enableLocationManagerFallback Whether to fall back to the Android framework's
 *  [android.location.LocationManager] APIs in case [com.google.android.gms.location.FusedLocationProviderClient]
 *  location settings checks fail.
 *  This can happen for multiple reasons, e.g. Google Play Services location APIs are unavailable
 *      or device has no Network connection (e.g. on Airplane mode).
 *  If set to `false`, failures will propagate as exceptions instead of falling back.
 *  Note that [android.location.LocationManager] may not be as effective as Google Play Services implementation.
 *  This means that to receive location, you may need a higher timeout.
 *  If the device's in airplane mode, only the GPS provider is used, which may only return a location
 *      if there's movement (e.g. walking or driving), otherwise it may time out.
 * @property interval Default interval in **milliseconds** to receive location updates in `addWatch`.
 *  By default equal to [timeout]. If you are experiencing location timeouts, try setting
 *  [interval] to a value lower than [timeout].
 * @property minUpdateInterval Optional minimum interval in **milliseconds** between consecutive
 *  location updates when using `addWatch`.
 */
data class IONGLOCLocationOptions(
    val timeout: Long,
    val maximumAge: Long,
    val enableHighAccuracy: Boolean,
    val enableLocationManagerFallback: Boolean,
    val interval: Long = timeout,
    val minUpdateInterval: Long? = null,
)
