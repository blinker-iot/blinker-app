package io.ionic.libs.iongeolocationlib.controller

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.hardware.GeomagneticField

/**
 * Handler for device sensors to calculate heading.
 */
internal class IONGLOCSensorHandler(context: Context) : SensorEventListener {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

    private var gravity: FloatArray? = null
    private var geomagnetic: FloatArray? = null

    @Volatile
    var magneticHeading: Float? = null
        private set

    @Volatile
    var headingAccuracy: Float? = null
        private set

    private var watcherCount = 0

    @Synchronized
    fun start() {
        if (watcherCount == 0) {
            accelerometer?.let {
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
            }
            magnetometer?.let {
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
            }
        }
        watcherCount++
    }

    @Synchronized
    fun stop() {
        watcherCount--
        if (watcherCount <= 0) {
            watcherCount = 0
            sensorManager.unregisterListener(this)
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            gravity = event.values
        }
        if (event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
            geomagnetic = event.values
            // Using magnetometer accuracy as heading accuracy proxy
            headingAccuracy = getHeadingAccuracy(event.accuracy)
        }

        updateHeadings()
    }

    private fun updateHeadings() {
        val g = gravity ?: return
        val m = geomagnetic ?: return

        val r = FloatArray(9)
        val i = FloatArray(9)

        if (SensorManager.getRotationMatrix(r, i, g, m)) {
            val orientation = FloatArray(3)
            SensorManager.getOrientation(r, orientation)

            // Azimuth is orientation[0], in radians.
            // Convert to degrees and normalize to 0-360.
            val azimuthInRadians = orientation[0]
            val azimuthInDegrees = Math.toDegrees(azimuthInRadians.toDouble()).toFloat()
            magneticHeading = (azimuthInDegrees + 360) % 360
        }
    }

    /**
     * Calculates the true heading on the fly based on a given location.
     * @param location the location to use for calculating the geomagnetic declination
     * @return the calculated true heading or null if magnetic heading is not yet available
     */
    fun getTrueHeading(location: Location): Float? {
        return magneticHeading?.let { mh ->
            val geoField = GeomagneticField(
                location.latitude.toFloat(),
                location.longitude.toFloat(),
                location.altitude.toFloat(),
                location.time
            )
            (mh + geoField.declination + 360) % 360
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
            headingAccuracy = getHeadingAccuracy(accuracy)
        }
    }

    /**
     * Uses SensorManager accuracy status as a heuristic proxy for heading accuracy,
     * as Android does not provide direct heading accuracy in degrees for the magnetometer.
     */
    private fun getHeadingAccuracy(accuracy: Int): Float {
        return when (accuracy) {
            SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> 10f
            SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> 20f
            SensorManager.SENSOR_STATUS_ACCURACY_LOW -> 30f
            else -> 45f
        }
    }
}
