package io.ionic.libs.iongeolocationlib.model.internal

import androidx.core.location.LocationListenerCompat
import com.google.android.gms.location.LocationCallback

/**
 * Handler for receiving location updates, the implementation depends on if Play Services or Fallback is used
 */
sealed class LocationHandler {
    /**
     * Location updates returned via Google Play Service's [LocationCallback]
     */
    data class Callback(val callback: LocationCallback) : LocationHandler()

    /**
     * Location updates returned via fallback [android.location.LocationManager] with [LocationListenerCompat]
     */
    data class Listener(val listener: LocationListenerCompat) : LocationHandler()
}
