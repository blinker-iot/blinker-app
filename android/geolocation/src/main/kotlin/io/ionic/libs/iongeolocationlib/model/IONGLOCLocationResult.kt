package io.ionic.libs.iongeolocationlib.model

/**
 * Data class representing the object returned in getCurrentPosition and watchPosition
 */
data class IONGLOCLocationResult(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val accuracy: Float,
    val altitudeAccuracy: Float? = null,
    val heading: Float,
    val speed: Float,
    val timestamp: Long,
    val magneticHeading: Float? = null,
    val trueHeading: Float? = null,
    val headingAccuracy: Float? = null,
    val course: Float? = null
)
