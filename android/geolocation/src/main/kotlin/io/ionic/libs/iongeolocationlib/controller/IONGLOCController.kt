package io.ionic.libs.iongeolocationlib.controller

import android.app.Activity
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import io.ionic.libs.iongeolocationlib.controller.helper.IONGLOCFallbackHelper
import io.ionic.libs.iongeolocationlib.controller.helper.IONGLOCGoogleServicesHelper
import io.ionic.libs.iongeolocationlib.controller.helper.emitOrTimeoutBeforeFirstEmission
import io.ionic.libs.iongeolocationlib.controller.helper.toOSLocationResult
import io.ionic.libs.iongeolocationlib.model.IONGLOCException
import io.ionic.libs.iongeolocationlib.model.IONGLOCLocationOptions
import io.ionic.libs.iongeolocationlib.model.IONGLOCLocationResult
import io.ionic.libs.iongeolocationlib.model.internal.LocationHandler
import io.ionic.libs.iongeolocationlib.model.internal.LocationSettingsResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapConcat
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.isActive

/**
 * Entry point in IONGeolocationLib-Android
 *
 */
class IONGLOCController internal constructor(
    fusedLocationClient: FusedLocationProviderClient,
    private val locationManager: LocationManager,
    connectivityManager: ConnectivityManager,
    activityLauncher: ActivityResultLauncher<IntentSenderRequest>,
    private val googleServicesHelper: IONGLOCGoogleServicesHelper = IONGLOCGoogleServicesHelper(
        locationManager,
        connectivityManager,
        fusedLocationClient,
        activityLauncher
    ),
    private val fallbackHelper: IONGLOCFallbackHelper = IONGLOCFallbackHelper(
        locationManager, connectivityManager
    ),
    private val sensorHandler: IONGLOCSensorHandler
) {

    constructor(
        context: Context,
        activityLauncher: ActivityResultLauncher<IntentSenderRequest>
    ) : this(
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(context),
        locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager,
        connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager,
        activityLauncher = activityLauncher,
        sensorHandler = IONGLOCSensorHandler(context)
    )

    private val resolveLocationSettingsResultFlow = MutableSharedFlow<Result<Unit>>()
    private val watchLocationHandlers: MutableMap<String, LocationHandler> = mutableMapOf()
    private val watchIdsBlacklist: MutableList<String> = mutableListOf()

    /**
     * Obtains the device's location using FusedLocationProviderClient.
     * Tries to obtain the last retrieved location, and then gets a fresh one if necessary.
     * @param activity the Android activity from which the location request is being triggered
     * @param options IONGLOCLocationOptions object with the options to obtain the location with (e.g. timeout)
     * @return Result<IONGLOCLocationResult> object with either the location or an exception to be handled by the caller
     */
    suspend fun getCurrentPosition(
        activity: Activity,
        options: IONGLOCLocationOptions,
        onStage: (String) -> Unit = {}
    ): Result<IONGLOCLocationResult> {
        val result = try {
            onStage("preflight_start")
            val checkResult: Result<Unit> =
                checkLocationPreconditions(activity, options, isSingleLocationRequest = true, onStage = onStage)
            onStage("preflight_complete")
            if (checkResult.shouldNotProceed(options)) {
                Result.failure(
                    checkResult.exceptionOrNull() ?: NullPointerException()
                )
            } else {
                val location: Location =
                    if (checkResult.isFailure && options.enableLocationManagerFallback) {
                        onStage("fallback_start")
                        fallbackHelper.getCurrentLocation(options).also {
                            onStage("fallback_result")
                        }
                    } else {
                        googleServicesHelper.getCurrentLocation(options, onStage)
                    }
                val result = location.toOSLocationResult()
                Result.success(result)
            }
        } catch (exception: CancellationException) {
            // Cancellation belongs to the single request owner, not the fallback/error policy.
            throw exception
        } catch (exception: Exception) {
            Log.d(LOG_TAG, "Error fetching location: ${exception.message}")
            Result.failure(exception)
        }
        onStage("controller_result")
        return result
    }

    /**
     * Function to be called by the client after returning from the activity
     * that is launched when resolving the ResolvableApiException in checkLocationSettings,
     * that prompts the user to enable the location if it is disabled.
     * @param resultCode to determine if the user enabled the location when prompted
     */
    suspend fun onResolvableExceptionResult(resultCode: Int) {
        resolveLocationSettingsResultFlow.emit(
            if (resultCode == Activity.RESULT_OK)
                Result.success(Unit)
            else
                Result.failure(
                    IONGLOCException.IONGLOCRequestDeniedException(
                        message = "Request to enable location denied."
                    )
                )
        )
    }

    /**
     * Checks if location services are enabled
     * @return true if location is enabled, false otherwise
     */
    fun areLocationServicesEnabled(): Boolean {
        return LocationManagerCompat.isLocationEnabled(locationManager)
    }

    /**
     * Creates a callback for location updates.
     * @param activity the Android activity from which the location request is being triggered
     * @param options location request options to use
     * @param watchId a unique id identifying the watch
     * @return Flow in which location updates will be emitted, or failure if something went wrong in retrieving updates
     */
    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    fun addWatch(
        activity: Activity,
        options: IONGLOCLocationOptions,
        watchId: String
    ): Flow<Result<List<IONGLOCLocationResult>>> {

        val setupFlow = watchSetupPreconditionsFlow(activity, options)
        // Concatenate flows: only proceed with watch if setup is successful
        return setupFlow.flatMapConcat { setupResult ->
            if (setupResult.isFailure) {
                flowOf(Result.failure(setupResult.exceptionOrNull() ?: NullPointerException()))
            } else {
                watchLocationUpdatesFlow(
                    options,
                    useFallback = setupResult.getOrNull() ?: false,
                    watchId
                )
                    .emitOrTimeoutBeforeFirstEmission(timeoutMillis = options.timeout)
                    .onEach { emission ->
                        if (emission.exceptionOrNull() is IONGLOCException.IONGLOCLocationRetrievalTimeoutException) {
                            clearWatch(watchId)
                        }
                    }
            }
        }
    }

    /**
     * Clears a watch by removing its location update request
     * @param id the watch id
     * @return true if watch was cleared, false if watch was not found
     */
    fun clearWatch(id: String): Boolean = clearWatch(id, addToBlackList = true)

    /**
     * Create a flow for setup and checking preconditions for watch location
     * @param activity the Android activity from which the location request is being triggered
     * @param options location request options to use
     * @return Flow with success if pre-condition checks passed and boolean flag to decide whether or not fallback is required, or failure otherwise.
     */
    private fun watchSetupPreconditionsFlow(
        activity: Activity,
        options: IONGLOCLocationOptions
    ): Flow<Result<Boolean>> = flow {
        try {
            val checkResult: Result<Unit> =
                checkLocationPreconditions(activity, options, isSingleLocationRequest = false)
            if (checkResult.shouldNotProceed(options)) {
                emit(Result.failure(checkResult.exceptionOrNull() ?: NullPointerException()))
            } else {
                val useFallback = checkResult.isFailure && options.enableLocationManagerFallback
                emit(Result.success(useFallback))
            }
        } catch (exception: Exception) {
            Log.d(LOG_TAG, "Error getting pre-conditions for watch: ${exception.message}")
            if (currentCoroutineContext().isActive) {
                emit(Result.failure(exception))
            } else if (exception is CancellationException) {
                throw exception
            }
        }
    }

    /**
     * Create a flow where location updates are emitted for a watch.
     * @param options location request options to use
     * @param useFallback whether or not the fallback should be used
     * @param watchId a unique id identifying the watch
     * @return Flow in which location updates will be emitted
     */
    private fun watchLocationUpdatesFlow(
        options: IONGLOCLocationOptions,
        useFallback: Boolean,
        watchId: String,
    ): Flow<Result<List<IONGLOCLocationResult>>> = callbackFlow {
        fun onNewLocations(locations: List<Location>) {
            if (checkWatchInBlackList(watchId)) return
            val locationResultList = locations.map { 
                it.toOSLocationResult(
                    magneticHeading = sensorHandler.magneticHeading,
                    trueHeading = sensorHandler.getTrueHeading(it),
                    headingAccuracy = sensorHandler.headingAccuracy
                ) 
            }
            trySend(Result.success(locationResultList))
        }

        sensorHandler.start()
        try {
            requestLocationUpdates(
                watchId,
                options,
                useFallback = useFallback
            ) { 
                onNewLocations(it) 
            }
        } catch (e: Exception) {
            trySend(Result.failure(e))
        }

        awaitClose {
            Log.d(LOG_TAG, "channel closed")
        }
    }

    /**
     * Checks if all preconditions for retrieving location are met
     * @param activity the Android activity from which the location request is being triggered
     * @param options location request options to use
     * @param isSingleLocationRequest true if request is for a single location, false if for location updates
     */
    private suspend fun checkLocationPreconditions(
        activity: Activity,
        options: IONGLOCLocationOptions,
        isSingleLocationRequest: Boolean,
        onStage: (String) -> Unit = {}
    ): Result<Unit> {
        // check timeout
        if (options.timeout <= 0) {
            return Result.failure(
                IONGLOCException.IONGLOCInvalidTimeoutException(
                    message = "Timeout needs to be a positive value."
                )
            )
        }
        // if meant to use fallback, then resolvable errors from Play Services Location don't need to be addressed
        val playServicesResult = googleServicesHelper.checkGooglePlayServicesAvailable(
            activity, shouldTryResolve = !options.enableLocationManagerFallback
        )
        if (playServicesResult.isFailure) {
            return Result.failure(playServicesResult.exceptionOrNull() ?: NullPointerException())
        }

        val locationSettingsResult = googleServicesHelper.checkLocationSettings(
            activity,
            options.copy(timeout = if (isSingleLocationRequest) 0 else options.timeout),
            shouldTryResolve = !options.enableLocationManagerFallback,
            onStage = onStage
        )

        return locationSettingsResult.toKotlinResult()
    }

    /**
     * Request location updates using the appropriate helper class
     * @param watchId a unique id to associate with the location update request (so that it may be cleared later)
     * @param options location request options to use
     * @param useFallback whether or not the fallback should be used
     * @param onNewLocations lambda to notify of new location requests
     */
    private fun requestLocationUpdates(
        watchId: String,
        options: IONGLOCLocationOptions,
        useFallback: Boolean,
        onNewLocations: (List<Location>) -> Unit
    ) {
        watchLocationHandlers[watchId] = if (!useFallback) {
            LocationHandler.Callback(object : LocationCallback() {
                override fun onLocationResult(location: LocationResult) {
                    onNewLocations(location.locations)
                }
            }).also {
                googleServicesHelper.requestLocationUpdates(options, it.callback)
            }
        } else {
            LocationHandler.Listener(object : LocationListenerCompat {
                override fun onLocationChanged(location: Location) {
                    onNewLocations(listOf(location))
                }

                override fun onLocationChanged(locations: List<Location?>) {
                    locations.filterNotNull().takeIf { it.isNotEmpty() }?.let {
                        onNewLocations(it)
                    }
                }
            }).also {
                fallbackHelper.requestLocationUpdates(options, it.listener)
            }
        }
    }

    /**
     * Clears a watch by removing its location update request
     * @param id the watch id
     * @param addToBlackList whether or not the watch id should go in blacklist if not found
     * @return true if watch was cleared, false if watch was not found
     */
    private fun clearWatch(id: String, addToBlackList: Boolean): Boolean {
        val watchHandler = watchLocationHandlers.remove(key = id)

        sensorHandler.stop()
        
        return when (watchHandler) {
            is LocationHandler.Callback -> {
                googleServicesHelper.removeLocationUpdates(watchHandler.callback)
                true
            }

            is LocationHandler.Listener -> {
                fallbackHelper.removeLocationUpdates(watchHandler.listener)
                true
            }

            else -> {
                if (addToBlackList) {
                    // It is possible that clearWatch is being called before requestLocationUpdates is triggered (e.g. very low timeout on JavaScript side.)
                    //  add to a blacklist in order to remove the location callback in the future
                    watchIdsBlacklist.add(id)
                }
                false
            }
        }
    }

    /**
     * Checks if the current watch is in the blacklist
     *
     * If the watch is in the blacklist, location updates for that watch should be removed.
     * @param watchId the unique id of the watch
     * @return true if watch is in blacklist, false otherwise
     */
    private fun checkWatchInBlackList(watchId: String): Boolean {
        if (watchIdsBlacklist.contains(watchId)) {
            val cleared = clearWatch(watchId, addToBlackList = false)
            if (cleared) {
                watchIdsBlacklist.remove(watchId)
            }
            return true
        }
        return false
    }

    /**
     * Extension function to convert the [LocationSettingsResult].
     * Depending on the result value, it may suspend to await a flow
     * @return a regular Kotlin [Result], which may be either Success or Error.
     */
    private suspend fun LocationSettingsResult.toKotlinResult(): Result<Unit> {
        return when (this) {
            LocationSettingsResult.Success -> Result.success(Unit)
            LocationSettingsResult.Resolving -> resolveLocationSettingsResultFlow.first()
            is LocationSettingsResult.ResolveSkipped -> Result.failure(resolvableError)
            is LocationSettingsResult.UnresolvableError -> Result.failure(error)
        }
    }

    /**
     * @return true if the settings result is such that the location request must fail
     *  (even if enableLocationManagerFallback=true), or false otherwise
     */
    private fun Result<Unit>.shouldNotProceed(options: IONGLOCLocationOptions): Boolean =
        isFailure && (!options.enableLocationManagerFallback ||
                exceptionOrNull() is IONGLOCException.IONGLOCLocationAndNetworkDisabledException ||
                exceptionOrNull() is IONGLOCException.IONGLOCRequestDeniedException)

    companion object {
        private const val LOG_TAG = "IONGeolocationController"
    }

}
