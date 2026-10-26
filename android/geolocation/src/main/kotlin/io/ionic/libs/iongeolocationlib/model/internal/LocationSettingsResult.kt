package io.ionic.libs.iongeolocationlib.model.internal

import com.google.android.gms.common.api.ResolvableApiException

/**
 * Result returned from checking Location Settings
 */
internal sealed class LocationSettingsResult {
    /**
     * Location settings checked successfully - Able to request location via Google Play Services
     */
    data object Success : LocationSettingsResult()

    /**
     * Received an error from location settings that may be resolved by the user.
     * Check `resolveLocationSettingsResultFlow` in `IONGLOCController` to receive this result
     */
    data object Resolving : LocationSettingsResult()

    /**
     * Received a resolvable error from location settings, but resolving was skipped.
     * Check the docs on `checkLocationSettings` for more information
     */
    data class ResolveSkipped(val resolvableError: ResolvableApiException) :
        LocationSettingsResult()

    /**
     * An unresolvable error occurred - Cannot request location via Google Play Services
     */
    data class UnresolvableError(val error: Exception) : LocationSettingsResult()
}
