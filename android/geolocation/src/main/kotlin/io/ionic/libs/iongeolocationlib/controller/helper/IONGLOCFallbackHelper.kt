package io.ionic.libs.iongeolocationlib.controller.helper

import android.annotation.SuppressLint
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.os.Build
import android.os.Looper
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.location.LocationRequestCompat
import io.ionic.libs.iongeolocationlib.model.IONGLOCException
import io.ionic.libs.iongeolocationlib.model.IONGLOCLocationOptions
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume

/**
 * Helper class that wraps the functionality of Android's [LocationManager].
 * Meant to be used only as a fallback in case we cannot used the Fused Location Provider from Play Services.
 */
internal class IONGLOCFallbackHelper(
    private val locationManager: LocationManager,
    private val connectivityManager: ConnectivityManager
) {
    /**
     * Obtains a fresh device location.
     * @param options location request options to use
     * @return Location object representing the location
     */
    @SuppressLint("MissingPermission")
    internal suspend fun getCurrentLocation(options: IONGLOCLocationOptions): Location = try {
        withTimeout(timeMillis = options.timeout) {
            suspendCancellableCoroutine { continuation ->
                getValidCachedLocation(options)?.let { validCacheLocation ->
                    continuation.resume(validCacheLocation)
                    return@suspendCancellableCoroutine
                }

                // cached location inexistent or too old - must make a fresh location request
                val locationRequest = LocationRequestCompat.Builder(0).apply {
                    setQuality(getQualityToUse(options))
                }.build()
                var locationListener: LocationListenerCompat? = null
                locationListener = LocationListenerCompat { location ->
                    locationListener?.let {
                        // remove listener to only allow one location update
                        removeLocationUpdates(it)
                        locationListener = null
                    }
                    continuation.resume(location)
                }
                locationListener?.let {
                    LocationManagerCompat.requestLocationUpdates(
                        locationManager,
                        getProviderToUse(),
                        locationRequest,
                        it,
                        Looper.getMainLooper()
                    )
                }

                // If coroutine is cancelled (due to timeout or external cancel), remove listener
                continuation.invokeOnCancellation {
                    locationListener?.let {
                        removeLocationUpdates(it)
                        locationListener = null
                    }
                }
            }
        }
    } catch (e: TimeoutCancellationException) {
        throw IONGLOCException.IONGLOCLocationRetrievalTimeoutException(
            message = "Location request timed out",
            cause = e
        )
    }

    /**
     * Requests updates of device location.
     *
     * Locations returned in callback associated with watchId
     * @param options location request options to use
     * @param locationListener the [LocationListenerCompat] to receive location updates in
     */
    @SuppressLint("MissingPermission")
    internal fun requestLocationUpdates(
        options: IONGLOCLocationOptions,
        locationListener: LocationListenerCompat
    ) {
        // note: setMaxUpdateAgeMillis unavailable in this API, which is why we explicitly try to retrieve it before starting the location request
        getValidCachedLocation(options)?.let { validCacheLocation ->
            locationListener.onLocationChanged(validCacheLocation)
        }

        val locationRequest = LocationRequestCompat.Builder(options.interval).apply {
            setQuality(getQualityToUse(options))
            if (options.minUpdateInterval != null) {
                setMinUpdateIntervalMillis(options.minUpdateInterval)
            }
        }.build()

        LocationManagerCompat.requestLocationUpdates(
            locationManager,
            getProviderToUse(),
            locationRequest,
            locationListener,
            Looper.getMainLooper()
        )
    }

    /**
     * Remove location updates for a specific listener.
     *
     * This method only triggers the removal, it does not await to see if the listener was actually removed.
     *
     * @param locationListener the location listener to be removed
     */
    @SuppressLint("MissingPermission")
    internal fun removeLocationUpdates(
        locationListener: LocationListenerCompat
    ) {
        LocationManagerCompat.removeUpdates(locationManager, locationListener)
    }

    /**
     * Get the last cached location if valid (newer that options#maximumAge)
     * @param options location request options to use
     * @return the cached [Location] or null if it didn't exist or was too old.
     */
    @SuppressLint("MissingPermission")
    private fun getValidCachedLocation(options: IONGLOCLocationOptions): Location? {
        // get from whichever of the providers has the latest location
        val cachedLocation = listOfNotNull(
            locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER),
            locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        ).maxByOrNull { it.time }
        return cachedLocation?.takeIf {
            (System.currentTimeMillis() - it.time) < options.maximumAge
        }
    }

    /**
     * Get the desired location request quality to use based on the provided options and providers.
     * If there's no network provider, the request will go one quality level down, to avoid reducing timeouts from using only GPS.
     * @param options location request options to use
     * @return an integer indicating the desired quality for location request
     */
    private fun getQualityToUse(options: IONGLOCLocationOptions): Int {
        val networkEnabled =
            hasNetworkEnabledForLocationPurposes(locationManager, connectivityManager)
        return when {
            options.enableHighAccuracy && networkEnabled -> LocationRequestCompat.QUALITY_HIGH_ACCURACY
            options.enableHighAccuracy || networkEnabled -> LocationRequestCompat.QUALITY_BALANCED_POWER_ACCURACY
            else -> LocationRequestCompat.QUALITY_LOW_POWER
        }
    }

    /**
     * @return the location provider to use
     */
    private fun getProviderToUse() =
        if (hasNetworkEnabledForLocationPurposes(locationManager, connectivityManager)
            && IONGLOCBuildConfig.getAndroidSdkVersionCode() >= Build.VERSION_CODES.S
        ) {
            LocationManager.FUSED_PROVIDER
        } else {
            LocationManager.GPS_PROVIDER
        }
}
