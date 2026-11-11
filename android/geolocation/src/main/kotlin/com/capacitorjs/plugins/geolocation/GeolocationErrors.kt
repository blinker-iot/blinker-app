package com.capacitorjs.plugins.geolocation

/**
 * Object with plugin errors
 */
object GeolocationErrors {

    private fun formatErrorCode(number: Int): String {
        return "OS-PLUG-GLOC-" + number.toString().padStart(4, '0')
    }

    data class ErrorInfo(
        val code: String,
        val message: String
    )

    val POSITION_UNAVAILABLE = ErrorInfo(
        code = formatErrorCode(2),
        message = "There was en error trying to obtain the location."
    )

    val LOCATION_PERMISSIONS_DENIED = ErrorInfo(
        code = formatErrorCode(3),
        message = "Location permission request was denied."
    )

    val LOCATION_DISABLED = ErrorInfo(
        code = formatErrorCode(7),
        message = "Location services are not enabled."
    )

    val LOCATION_ENABLE_REQUEST_DENIED = ErrorInfo(
        code = formatErrorCode(9),
        message = "Request to enable location was denied."
    )

    val GET_LOCATION_TIMEOUT = ErrorInfo(
        code = formatErrorCode(10),
        message = "Could not obtain location in time. Try with a higher timeout."
    )

    val INVALID_TIMEOUT = ErrorInfo(
        code = formatErrorCode(11),
        message = "Timeout needs to be a positive value."
    )

    val WATCH_ID_NOT_FOUND = ErrorInfo(
        code = formatErrorCode(12),
        message = "WatchId not found."
    )

    val WATCH_ID_NOT_PROVIDED = ErrorInfo(
        code = formatErrorCode(13),
        message = "WatchId needs to be provided."
    )

    val GOOGLE_SERVICES_RESOLVABLE = ErrorInfo(
        code = formatErrorCode(14),
        message = "Google Play Services error user resolvable."
    )

    val GOOGLE_SERVICES_ERROR = ErrorInfo(
        code = formatErrorCode(15),
        message = "Google Play Services error."
    )

    val LOCATION_SETTINGS_ERROR = ErrorInfo(
        code = formatErrorCode(16),
        message = "Location settings error."
    )

    val NETWORK_LOCATION_DISABLED_ERROR = ErrorInfo(
        code = formatErrorCode(17),
        message = "Unable to retrieve location because device has both Network and Location turned off."
    )

    val LOCATION_MANIFEST_PERMISSIONS_MISSING = ErrorInfo(
        code = formatErrorCode(18),
        message = "Location permissions are not declared in manifest. Make sure at least ACCESS_COARSE_LOCATION is declared in AndroidManifest.xml, and optionally ACCESS_FINE_LOCATION if you require precise location access."
    )
}
