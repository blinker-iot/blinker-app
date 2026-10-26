package com.capacitorjs.plugins.geolocation

import android.Manifest
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.core.location.LocationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.ionic.libs.iongeolocationlib.controller.IONGLOCController
import io.ionic.libs.iongeolocationlib.model.IONGLOCException
import io.ionic.libs.iongeolocationlib.model.IONGLOCLocationOptions
import io.ionic.libs.iongeolocationlib.model.IONGLOCLocationResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(
    name = "Geolocation",
    permissions = [Permission(
        strings = [Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION],
        alias = GeolocationPlugin.LOCATION_ALIAS
    ), Permission(
        strings = [Manifest.permission.ACCESS_COARSE_LOCATION],
        alias = GeolocationPlugin.COARSE_LOCATION_ALIAS
    )]
)
class GeolocationPlugin : Plugin() {

    // The existing watch implementation is lazy; a one-shot system fix never
    // initializes or waits for the Google location client.
    private lateinit var activityLauncher: ActivityResultLauncher<IntentSenderRequest>
    private val controller: IONGLOCController by lazy { IONGLOCController(context, activityLauncher) }
    private lateinit var locationManager: LocationManager
    private lateinit var coroutineScope: CoroutineScope
    private val watchingCalls: MutableMap<String, PluginCall> = mutableMapOf()
    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var currentPosition: PositionSession? = null

    private class PositionSession(val call: PluginCall, val id: String) {
        lateinit var owner: CurrentPositionRequest
        private val started = SystemClock.elapsedRealtime()
        private var traceCount = 0
        @Synchronized fun trace(stage: String) {
            // Opt-in with log.tag.BlinkerLocation=DEBUG; never log a fix or error text.
            if (!Log.isLoggable("BlinkerLocation", Log.DEBUG) || traceCount >= 24) return
            traceCount++
            Log.d("BlinkerLocation", "rid=$id stage=$stage elapsedMs=${SystemClock.elapsedRealtime() - started}")
        }
    }

    companion object {
        const val LOCATION_ALIAS: String = "location"
        const val COARSE_LOCATION_ALIAS: String = "coarseLocation"
    }

    override fun load() {
        super.load()

        coroutineScope = CoroutineScope(Dispatchers.Main)
        locationManager = context.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager
        activityLauncher = activity.registerForActivityResult(
            ActivityResultContracts.StartIntentSenderForResult()
        ) { result ->
            CoroutineScope(Dispatchers.Main).launch {
                controller.onResolvableExceptionResult(result.resultCode)
            }
        }

    }

    override fun handleOnDestroy() {
        currentPosition?.let { session -> session.owner.cancel { rejectPosition(session, "BLINKER_LOCATION_CANCELLED") } }
        super.handleOnDestroy()
        coroutineScope.cancel()
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        checkLocationState(call) { super.checkPermissions(call) }
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        checkLocationState(call) { super.requestPermissions(call) }
    }

    /**
     * Helper function to determine if location services are enabled or not
     * @param call the PluginCall to use in case we want to send an error
     * @param onLocationEnabled lambda function to use in case location services are enabled
     */
    private fun checkLocationState(call: PluginCall, onLocationEnabled: () -> Unit) {
        if (LocationManagerCompat.isLocationEnabled(locationManager)) {
            onLocationEnabled()
        } else {
            call.sendError(GeolocationErrors.LOCATION_DISABLED)
        }
    }

    /**
     * Checks location permission state, requesting them if necessary.
     * If not, calls getPosition to get the device's position
     * @param call the plugin call
     */
    @PluginMethod
    fun getCurrentPosition(call: PluginCall) {
        // Capacitor methods may run on its plugin thread. Serialize ownership,
        // permission callbacks and deadline handling on the same Android looper.
        handler.post { beginCurrentPosition(call) }
    }

    private fun beginCurrentPosition(call: PluginCall) {
        if (currentPosition?.owner?.isActive() == true) {
            call.reject("Another location request is pending.", "BLINKER_LOCATION_PENDING")
            return
        }
        val timeout = call.getNumber("timeout", 10000)
        if (timeout <= 0) { call.sendError(GeolocationErrors.INVALID_TIMEOUT); return }
        val requestedId = call.getString("requestId")
        val id = requestedId?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,64}")) } ?: call.callbackId
        val session = PositionSession(call, id)
        session.owner = CurrentPositionRequest(timeout, SystemClock::elapsedRealtime,
            object : CurrentPositionRequest.Scheduler {
                override fun postDelayed(task: Runnable, delayMillis: Long) { handler.postDelayed(task, delayMillis) }
                override fun remove(task: Runnable) { handler.removeCallbacks(task) }
            }) { rejectPosition(session, GeolocationErrors.GET_LOCATION_TIMEOUT.code) }
        currentPosition = session
        session.trace("plugin_start")
        try {
            handlePermissionRequest(call, "completeCurrentPosition") { getPosition(call) }
        } catch (_: Exception) {
            call.sendError(GeolocationErrors.POSITION_UNAVAILABLE)
        }
    }

    @PluginMethod
    fun cancelCurrentPosition(call: PluginCall) {
        handler.post {
            val session = currentPosition
            if (session != null && call.getString("requestId") == session.id) {
                session.owner.cancel { rejectPosition(session, "BLINKER_LOCATION_CANCELLED") }
            }
            call.resolve()
        }
    }

    private fun rejectPosition(session: PositionSession, code: String) {
        if (currentPosition === session) currentPosition = null
        session.trace(if (code == GeolocationErrors.GET_LOCATION_TIMEOUT.code) "plugin_timeout" else "plugin_reject")
        session.call.reject("Location request ended.", code)
    }

    /**
     * Checks location permission state, requesting them if necessary.
     * If not, calls startWatch to start getting location updates
     * @param call the plugin call
     */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    fun watchPosition(call: PluginCall) {
        handlePermissionRequest(call, "completeWatchPosition") { startWatch(call) }
    }

    /**
     * Helper function to determine if a permission is granted or not and request it if necessary
     * @param call the PluginCall to use in case we want to send an error
     * @param callbackName a string identifying the callback to call once the permission prompt is answered
     * @param onPermissionGranted lambda function to use in case the permission is enabled
     */
    private fun handlePermissionRequest(
        call: PluginCall,
        callbackName: String,
        onPermissionGranted: () -> Unit
    ) {
        val alias = getAlias(call) ?: run {
            call.sendError(GeolocationErrors.LOCATION_MANIFEST_PERMISSIONS_MISSING)
            return
        }
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, callbackName)
        } else {
            onPermissionGranted()
        }
    }

    /**
     * Completes the getCurrentPosition plugin call after a permission request
     * @see .getCurrentPosition
     * @param call the plugin call
     */
    @PermissionCallback
    private fun completeCurrentPosition(call: PluginCall) {
        handler.post {
            val session = currentPosition?.takeIf { it.call.callbackId == call.callbackId } ?: return@post
            if (!session.owner.isActive()) return@post
            handlePermissionResult(call) { getPosition(call) }
        }
    }

    /**
     * Completes the watchPosition plugin call after a permission request
     * @see .startWatch
     * @param call the plugin call
     */
    @PermissionCallback
    private fun completeWatchPosition(call: PluginCall) {
        handlePermissionResult(call) { startWatch(call) }
    }

    /**
     * Helper function to handle the result of a location permission request
     * @param call the PluginCall to use in case we want to send an error
     * @param onPermissionGranted lambda function to use in case the permission was granted
     */
    private fun handlePermissionResult(call: PluginCall, onPermissionGranted: () -> Unit) {
        if (getPermissionState(COARSE_LOCATION_ALIAS) == PermissionState.GRANTED) {
            onPermissionGranted()
        } else {
            call.sendError(GeolocationErrors.LOCATION_PERMISSIONS_DENIED)
        }
    }

    /**
     * Clears the watch, removing location updates.
     * @param call the plugin call
     */
    @PluginMethod
    fun clearWatch(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrBlank()) {
            call.sendError(GeolocationErrors.WATCH_ID_NOT_PROVIDED)
        } else {
            watchingCalls.remove(id)?.release(bridge)
            val watchCleared = controller.clearWatch(id)
            if (watchCleared) {
                call.sendSuccess()
            } else {
                call.sendError(GeolocationErrors.WATCH_ID_NOT_FOUND)
            }
        }
    }

    /**
     * Gets the appropriate permission alias, based on the Android version, 
     *  the permissions declared in the manifest 
     *  and the enableHighAccuracy option provided by the caller.
     * @param call the plugin call
     * @return String with correct alias or null if no permissions can be requested
     */
    private fun getAlias(call: PluginCall): String? {
        val hasFine = isPermissionDeclared(LOCATION_ALIAS)
        val hasCoarse = isPermissionDeclared(COARSE_LOCATION_ALIAS)
        if (!hasFine && !hasCoarse) return null
        val enableHighAccuracy = call.getBoolean("enableHighAccuracy") ?: false
        val shouldRequestFine =
            hasFine && (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || enableHighAccuracy)
        return if (shouldRequestFine) LOCATION_ALIAS else COARSE_LOCATION_ALIAS
    }

    /**
     * Gets the current position
     * @param call the plugin call
     */
    private fun getPosition(call: PluginCall) {
        val session = currentPosition?.takeIf { it.call.callbackId == call.callbackId } ?: return
        if (!session.owner.isActive()) return
        session.trace("permission_ready")
        if (!LocationManagerCompat.isLocationEnabled(locationManager)) {
            session.owner.complete { rejectPosition(session, GeolocationErrors.LOCATION_DISABLED.code) }
            return
        }
        val provider = SystemLocationProvider(
            context = context,
            allowGps = getPermissionState(LOCATION_ALIAS) == PermissionState.GRANTED,
            maximumAgeMillis = call.getNumber("maximumAge", 0),
            isActive = session.owner::isActive,
            trace = session::trace,
            onFix = { location, source ->
                try {
                    val result = getJSObjectForSystemLocation(location, source)
                    session.owner.complete {
                        if (currentPosition === session) currentPosition = null
                        session.trace("plugin_resolve")
                        call.resolve(result)
                    }
                } catch (_: Exception) {
                    session.owner.complete { rejectPosition(session, GeolocationErrors.POSITION_UNAVAILABLE.code) }
                }
            },
            onUnavailable = {
                session.owner.complete { rejectPosition(session, GeolocationErrors.POSITION_UNAVAILABLE.code) }
            }
        )
        session.owner.linkCancellation { session.trace("owner_cancel"); provider.cancel() }
        provider.start()
    }

    private fun getJSObjectForSystemLocation(location: Location, source: String): JSObject {
        val coords = JSObject().apply {
            put("latitude", location.latitude)
            put("longitude", location.longitude)
            put("accuracy", location.accuracy.toDouble())
            put("altitude", if (location.hasAltitude()) location.altitude else JSObject.NULL)
            put("altitudeAccuracy", if (location.hasVerticalAccuracy()) location.verticalAccuracyMeters.toDouble() else JSObject.NULL)
            put("speed", if (location.hasSpeed()) location.speed.toDouble() else JSObject.NULL)
            put("heading", if (location.hasBearing()) location.bearing.toDouble() else JSObject.NULL)
        }
        return JSObject().apply {
            put("coords", coords)
            put("timestamp", location.time)
            put("source", source)
            put("coordinateSystem", "WGS84")
        }
    }

    /**
     * Starts watching the device's location by requesting location updates
     * @param call the plugin call
     */
    private fun startWatch(call: PluginCall) {
        coroutineScope.launch {
            val watchId = call.callbackId

            val locationOptions = createOptions(call)

            // call addWatch method from controller
            controller.addWatch(activity, locationOptions, watchId).collect { result ->
                result.onSuccess { locationList ->
                    locationList.forEach { locationResult ->
                        call.sendSuccess(
                            result = getJSObjectForLocation(locationResult),
                            keepCallback = true)
                    }
                }
                result.onFailure { exception ->
                    onLocationError(exception, call)
                }
            }
        }
        watchingCalls[call.callbackId] = call
    }

    /**
     * Helper function to convert IONGLOCLocationResult object into the format accepted by the Capacitor bridge
     * @param locationResult IONGLOCLocationResult object with the location to convert
     * @return JSObject with converted JSON object
     */
    private fun getJSObjectForLocation(locationResult: IONGLOCLocationResult): JSObject {
        val coords = JSObject().apply {
            put("latitude", locationResult.latitude)
            put("longitude", locationResult.longitude)
            put("accuracy", locationResult.accuracy)
            put("altitude", locationResult.altitude)
            locationResult.altitudeAccuracy?.let { put("altitudeAccuracy", it) }
            put("speed", locationResult.speed)
            put("heading", if (locationResult.heading != -1f) locationResult.heading else null)
            put("magneticHeading", locationResult.magneticHeading)
            put("trueHeading", locationResult.trueHeading)
            put("headingAccuracy", locationResult.headingAccuracy)
            put("course", locationResult.course)
        }
        return JSObject().apply {
            put("timestamp", locationResult.timestamp)
            put("coords", coords)
        }
    }

    /**
     * Helper function to handle error cases
     * @param exception Throwable to handle as an error
     * @param call the plugin call
     */
    private fun onLocationError(exception: Throwable?, call: PluginCall) {
        call.sendError(locationError(exception))
    }

    private fun locationError(exception: Throwable?): GeolocationErrors.ErrorInfo =
        when (exception) {
            is IONGLOCException.IONGLOCRequestDeniedException -> {
                GeolocationErrors.LOCATION_ENABLE_REQUEST_DENIED
            }
            is IONGLOCException.IONGLOCSettingsException -> {
                GeolocationErrors.LOCATION_SETTINGS_ERROR
            }
            is IONGLOCException.IONGLOCLocationAndNetworkDisabledException -> {
                GeolocationErrors.NETWORK_LOCATION_DISABLED_ERROR
            }
            is IONGLOCException.IONGLOCInvalidTimeoutException -> {
                GeolocationErrors.INVALID_TIMEOUT
            }
            is IONGLOCException.IONGLOCGoogleServicesException -> {
                if (exception.resolvable) {
                    GeolocationErrors.GOOGLE_SERVICES_RESOLVABLE
                } else {
                    GeolocationErrors.GOOGLE_SERVICES_ERROR
                }
            }
            is IONGLOCException.IONGLOCLocationRetrievalTimeoutException -> {
                GeolocationErrors.GET_LOCATION_TIMEOUT
            }
            else -> {
                GeolocationErrors.POSITION_UNAVAILABLE
            }
        }

    /**
     * Extension function to return a successful plugin result
     * @param result JSOObject with the JSON content to return
     * @param keepCallback boolean to determine if callback should be kept for future calls or not
     */
    private fun PluginCall.sendSuccess(result: JSObject? = null, keepCallback: Boolean? = false) {
        this.setKeepAlive(keepCallback)
        if (result != null) {
            this.resolve(result)
        } else {
            this.resolve()
        }
    }

    /**
     * Extension function to return an unsuccessful plugin result
     * @param error error class representing the error to return, containing a code and message
     */
    private fun PluginCall.sendError(error: GeolocationErrors.ErrorInfo) {
        val session = currentPosition?.takeIf { it.call.callbackId == callbackId }
        if (session != null) {
            session.owner.complete { rejectPosition(session, error.code) }
            return
        }
        this.reject(error.message, error.code)
    }

    /**
     * Creates the location options to pass to the native controller
     * @param call the plugin call
     * @return IONGLOCLocationOptions object
     */
    private fun createOptions(call: PluginCall): IONGLOCLocationOptions {
        val timeout = call.getNumber("timeout", 10000)
        val maximumAge = call.getNumber("maximumAge", 0)
        val enableHighAccuracy = call.getBoolean("enableHighAccuracy", false) ?: false
        val minimumUpdateInterval = call.getNumber("minimumUpdateInterval", 5000)
        val enableLocationFallback = call.getBoolean("enableLocationFallback", true) ?: true
        val interval = call.getNumber("interval", -1).let {
            // using "< 0" and not "<= 0" because 0 is a valid value for interval
            if (it < 0) {
                timeout
            } else {
                it
            }
        }

        val locationOptions = IONGLOCLocationOptions(
            timeout,
            maximumAge,
            enableHighAccuracy,
            enableLocationFallback,
            interval = interval,
            minUpdateInterval = minimumUpdateInterval
        )

        return locationOptions
    }

    private fun PluginCall.getNumber(name: String, defaultValue: Long): Long =
        getLong(name) ?: getInt(name)?.toLong() ?: defaultValue
}
