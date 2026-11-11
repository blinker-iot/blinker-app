package io.ionic.libs.iongeolocationlib.controller.helper

import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.core.location.LocationManagerCompat
import io.ionic.libs.iongeolocationlib.model.IONGLOCException
import io.ionic.libs.iongeolocationlib.model.IONGLOCLocationResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * @return true if there's any active network capability that could be used to improve location, false otherwise.
 */
internal fun hasNetworkEnabledForLocationPurposes(
    locationManager: LocationManager,
    connectivityManager: ConnectivityManager
) = LocationManagerCompat.hasProvider(locationManager, LocationManager.NETWORK_PROVIDER) &&
        connectivityManager.activeNetwork?.let { network ->
            connectivityManager.getNetworkCapabilities(network)?.let { capabilities ->
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ||
                        (IONGLOCBuildConfig.getAndroidSdkVersionCode() >= Build.VERSION_CODES.O &&
                                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI_AWARE))
            }
        } ?: false

/**
 * Returns a Result object containing an IONGLOCException.IONGLOCGoogleServicesException exception with the given
 * resolvable and message values
 * @param resolvable whether or not the exception is resolvable
 * @param message message to include in the exception
 * @return Result object with the exception to return
 *
 */
internal fun sendResultWithGoogleServicesException(
    resolvable: Boolean,
    message: String
): Result<Unit> {
    return Result.failure(
        IONGLOCException.IONGLOCGoogleServicesException(
            resolvable = resolvable,
            message = message
        )
    )
}

/**
 * Extension function to convert Location object into OSLocationResult object
 * @return OSLocationResult object
 */
internal fun Location.toOSLocationResult(
    magneticHeading: Float? = null,
    trueHeading: Float? = null,
    headingAccuracy: Float? = null
): IONGLOCLocationResult {
    val course = if (this.hasBearing()) this.bearing else null
    return IONGLOCLocationResult(
        latitude = this.latitude,
        longitude = this.longitude,
        altitude = this.altitude,
        accuracy = this.accuracy,
        altitudeAccuracy = if (IONGLOCBuildConfig.getAndroidSdkVersionCode() >= Build.VERSION_CODES.O) this.verticalAccuracyMeters else null,
        heading = trueHeading ?: magneticHeading ?: course ?: -1f,
        speed = this.speed,
        timestamp = this.time,
        magneticHeading = magneticHeading,
        trueHeading = trueHeading,
        headingAccuracy = headingAccuracy,
        course = course
    )
}

/**
 * Flow extension to either emit its values, or emit a timeout error if [timeoutMillis] is reached before any emission
 */
fun <T> Flow<Result<T>>.emitOrTimeoutBeforeFirstEmission(timeoutMillis: Long): Flow<Result<T>> =
    channelFlow {
        var firstValue: Result<T>? = null

        val job = launch {
            collect { value ->
                if (firstValue == null) firstValue = value
                send(value)
            }
        }

        // Poll until first emission, or timeout
        withTimeoutOrNull(timeMillis = timeoutMillis) {
            while (firstValue == null) {
                delay(timeMillis = 10)
            }
        } ?: run {
            send(
                Result.failure(
                    IONGLOCException.IONGLOCLocationRetrievalTimeoutException(
                        "Location request timed out before first emission"
                    )
                )
            )
            job.cancel()
        }
    }
