package com.capacitorjs.plugins.geolocation

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Looper
import android.os.SystemClock
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.location.LocationRequestCompat

/** One bounded system request, linked to CurrentPositionRequest before start(). */
internal class SystemLocationProvider(
    context: Context,
    private val allowGps: Boolean,
    private val maximumAgeMillis: Long,
    private val isActive: () -> Boolean,
    private val trace: (String) -> Unit,
    private val onFix: (Location, String) -> Unit,
    private val onUnavailable: () -> Unit
) {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    private val startedNanos = SystemClock.elapsedRealtimeNanos()
    private val listeners = mutableListOf<LocationListenerCompat>()
    private var selection: SystemPositionSelection? = null
    private var started = false
    private var cancelled = false

    @SuppressLint("MissingPermission")
    fun start() {
        if (started || cancelled || !isActive()) return
        started = true
        trace("system_start")
        val providers = mutableListOf<Pair<Int, String>>()
        if (enabled(LocationManager.NETWORK_PROVIDER)) {
            providers += SystemPositionSelection.NETWORK to LocationManager.NETWORK_PROVIDER
        }
        if (allowGps && enabled(LocationManager.GPS_PROVIDER)) {
            providers += SystemPositionSelection.GNSS to LocationManager.GPS_PROVIDER
        }
        selection = SystemPositionSelection(
            providers.fold(0) { mask, provider -> mask or provider.first },
            startedNanos,
            maximumAgeMillis.coerceAtLeast(0)
        )
        if (providers.isEmpty()) {
            trace("system_unavailable")
            onUnavailable()
            return
        }
        for ((id, provider) in providers) {
            if (cancelled || !isActive()) break
            val listener = object : LocationListenerCompat {
                override fun onLocationChanged(location: Location) { receive(id, location, false) }
                override fun onProviderDisabled(provider: String) { receive(id, null, true) }
            }
            listeners += listener
            trace("${stage(id)}_start")
            try {
                // One registration per provider, sharing the owner's deadline. Do not use
                // maxUpdates=1: a cached callback must not consume the fresh-fix opportunity.
                val request = LocationRequestCompat.Builder(1000)
                    .setMinUpdateIntervalMillis(1000)
                    .setQuality(if (id == SystemPositionSelection.GNSS)
                        LocationRequestCompat.QUALITY_HIGH_ACCURACY
                    else LocationRequestCompat.QUALITY_BALANCED_POWER_ACCURACY)
                    .build()
                LocationManagerCompat.requestLocationUpdates(manager!!, provider, request, listener, Looper.getMainLooper())
                if (cancelled) remove(listener)
            } catch (_: RuntimeException) {
                receive(id, null, true)
            }
        }
    }

    fun cancel() {
        if (cancelled) return
        cancelled = true
        selection?.cancel()
        // A cancellation failure must not stop cancellation of the other provider.
        listeners.forEach(::remove)
        listeners.clear()
        trace("system_cleanup")
    }

    private fun remove(listener: LocationListenerCompat) {
        try { manager?.let { LocationManagerCompat.removeUpdates(it, listener) } }
        catch (_: RuntimeException) { trace("system_cancel_error") }
    }

    private fun enabled(provider: String): Boolean = try {
        manager?.isProviderEnabled(provider) == true
    } catch (_: RuntimeException) {
        false
    }

    private fun receive(provider: Int, location: Location?, error: Boolean) {
        if (cancelled || !isActive()) return
        val result = selection?.result(
            provider, location != null,
            location?.latitude ?: 0.0, location?.longitude ?: 0.0,
            location?.hasAccuracy() == true, location?.accuracy?.toDouble() ?: 0.0,
            location?.time ?: 0, location?.elapsedRealtimeNanos ?: 0,
            SystemClock.elapsedRealtimeNanos()
        ) ?: return
        if (result == SystemPositionSelection.Decision.IGNORE) return
        val outcome = when {
            error -> "error"
            location == null -> "null"
            result == SystemPositionSelection.Decision.ACCEPT -> "result"
            else -> "invalid"
        }
        trace("${stage(provider)}_$outcome")
        when (result) {
            SystemPositionSelection.Decision.ACCEPT ->
                onFix(location!!, if (provider == SystemPositionSelection.NETWORK) "system-network" else "gnss")
            SystemPositionSelection.Decision.UNAVAILABLE -> onUnavailable()
            else -> Unit
        }
    }

    private fun stage(provider: Int) =
        if (provider == SystemPositionSelection.NETWORK) "system_network" else "system_gnss"
}
