package io.ionic.libs.iongeolocationlib.controller.helper

import android.annotation.SuppressLint
import android.app.Activity
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.os.Looper
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import io.ionic.libs.iongeolocationlib.model.IONGLOCException
import io.ionic.libs.iongeolocationlib.model.IONGLOCLocationOptions
import io.ionic.libs.iongeolocationlib.model.internal.LocationSettingsResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.tasks.await
import java.util.concurrent.Executor

/**
 * Helper class that wraps the functionality of [FusedLocationProviderClient]
 */
internal class IONGLOCGoogleServicesHelper(
    private val locationManager: LocationManager,
    private val connectivityManager: ConnectivityManager,
    private val fusedLocationClient: FusedLocationProviderClient,
    private val activityLauncher: ActivityResultLauncher<IntentSenderRequest>
) {
    /**
     * Checks if location is on, as well as other conditions for retrieving device location
     * @param activity the Android activity from which the location request is being triggered
     * @param options location request options to use
     * @param shouldTryResolve true if should try to resolve errors; false otherwise.
     * Dictates whether [LocationSettingsResult.Resolving] or [LocationSettingsResult.ResolveSkipped] is returned.
     * The exception being if location is off, in which case it will always be resolved.
     * @return result of type [LocationSettingsResult]
     * @throws [IONGLOCException.IONGLOCSettingsException] if an error occurs that is not resolvable by user
     */
    internal suspend fun checkLocationSettings(
        activity: Activity,
        options: IONGLOCLocationOptions,
        shouldTryResolve: Boolean,
        onStage: (String) -> Unit = {}
    ): LocationSettingsResult {
        val request = LocationRequest.Builder(
            if (options.enableHighAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            options.interval
        ).build()

        val builder = LocationSettingsRequest.Builder()
        builder.addLocationRequest(request)
        val client = LocationServices.getSettingsClient(activity)

        try {
            client.checkLocationSettings(builder.build()).await()
            return LocationSettingsResult.Success
        } catch (e: ResolvableApiException) {
            val locationOn = LocationManagerCompat.isLocationEnabled(locationManager)
            if (!locationOn || shouldTryResolve) {
                // Show the dialog to enable location by calling startResolutionForResult(),
                // and then handle the result in onActivityResult
                val resolutionBuilder: IntentSenderRequest.Builder =
                    IntentSenderRequest.Builder(e.resolution)
                val resolution: IntentSenderRequest = resolutionBuilder.build()
                activityLauncher.launch(resolution)
                // ActivityResult is asynchronous on Main. Only a successful
                // launch owns the fence; a throwing launcher has no result.
                onStage("settings_resolution_start")
                return LocationSettingsResult.Resolving
            } else {
                return LocationSettingsResult.ResolveSkipped(e)
            }
        } catch (e: CancellationException) {
            // Do not turn an expired owner into a settings failure that starts fallback.
            throw e
        } catch (e: Exception) {
            return LocationSettingsResult.UnresolvableError(e.mapLocationSettingsError())
        }
    }

    /**
     * Checks if the device has google play services, required to use [FusedLocationProviderClient]
     * @param activity the Android activity from which the location request is being triggered
     * @param shouldTryResolve true if should try to resolve errors; false otherwise.
     * @return Success if google play services is available, Error otherwise
     */
    internal fun checkGooglePlayServicesAvailable(
        activity: Activity,
        shouldTryResolve: Boolean
    ): Result<Unit> {
        val googleApiAvailability = GoogleApiAvailability.getInstance()
        val status = googleApiAvailability.isGooglePlayServicesAvailable(activity)

        return if (status != ConnectionResult.SUCCESS) {
            if (googleApiAvailability.isUserResolvableError(status)) {
                if (shouldTryResolve) {
                    googleApiAvailability.getErrorDialog(activity, status, 1)?.show()
                }
                sendResultWithGoogleServicesException(
                    resolvable = true,
                    message = "Google Play Services error user resolvable."
                )
            } else {
                sendResultWithGoogleServicesException(
                    resolvable = false,
                    message = "Google Play Services error."
                )
            }
        } else {
            Result.success(Unit)
        }
    }

    /**
     * Obtains a fresh device location.
     * @param options location request options to use
     * @return Location object representing the location
     */
    @SuppressLint("MissingPermission")
    @OptIn(ExperimentalCoroutinesApi::class)
    internal suspend fun getCurrentLocation(
        options: IONGLOCLocationOptions,
        onStage: (String) -> Unit = {}
    ): Location {

        val locationRequest = CurrentLocationRequest.Builder()
            .setPriority(if (options.enableHighAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY)
            .setMaxUpdateAgeMillis(options.maximumAge)
            .setDurationMillis(options.timeout)
            .build()

        val cancellation = CancellationTokenSource()
        try {
            onStage("gms_task_start")
            val task = fusedLocationClient.getCurrentLocation(locationRequest, cancellation.token)
            // Observe actual Task completion independently of the main-thread/bridge queue.
            // Only fixed outcomes leave this boundary; no coordinates or exception text.
            task.addOnCompleteListener(Executor { it.run() }) { completed ->
                onStage(when {
                    completed.isCanceled -> "gms_task_cancel"
                    completed.exception != null -> "gms_task_error"
                    completed.result == null -> "gms_task_null"
                    else -> "gms_task_success"
                })
            }
            return task.await(cancellation)
                ?: throw IONGLOCException.IONGLOCLocationRetrievalTimeoutException(
                    message = "Location request timed out"
                )
        } finally {
            // The exact source passed to GMS also follows the owning coroutine's cancellation.
            cancellation.cancel()
        }
    }

    /**
     * Requests updates of device location.
     *
     * Locations returned in callback associated with watchId
     * @param options location request options to use
     * @param locationCallback the [LocationCallback] to receive location updates in
     */
    @SuppressLint("MissingPermission")
    internal fun requestLocationUpdates(
        options: IONGLOCLocationOptions,
        locationCallback: LocationCallback
    ) {
        val locationRequest = LocationRequest.Builder(options.interval).apply {
            setMaxUpdateAgeMillis(options.maximumAge)
            setPriority(if (options.enableHighAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY)
            if (options.minUpdateInterval != null) {
                setMinUpdateIntervalMillis(options.minUpdateInterval)
            }
        }.build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
    }

    /**
     * Remove location updates for a specific callback.
     *
     * This method only triggers the removal, it does not await to see if the callback was actually removed.
     *
     * @param locationCallback the location callback to be removed
     */
    internal fun removeLocationUpdates(
        locationCallback: LocationCallback
    ) {
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }

    /**
     * Map the Location Settings Exception to an exception from this native library.
     * @return a [IONGLOCException]
     */
    private fun Exception.mapLocationSettingsError(): IONGLOCException = if (this is ApiException &&
        message?.contains("SETTINGS_CHANGE_UNAVAILABLE") == true
        && !LocationManagerCompat.isLocationEnabled(locationManager)
        && !hasNetworkEnabledForLocationPurposes(locationManager, connectivityManager)
    ) {
        IONGLOCException.IONGLOCLocationAndNetworkDisabledException(
            message = "Unable to retrieve location because device has both Network and Location turned off.",
            cause = this
        )
    } else {
        IONGLOCException.IONGLOCSettingsException(
            message = "There is an error with the location settings.",
            cause = this
        )
    }
}
