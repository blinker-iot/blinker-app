package io.ionic.libs.iongeolocationlib.model

/**
 * Sealed class with exceptions that the library's functions can throw
 */
sealed class IONGLOCException(message: String, cause: Throwable?) : Exception(message, cause) {
    class IONGLOCSettingsException(
        message: String, cause: Throwable? = null
    ) : IONGLOCException(message, cause)
    class IONGLOCRequestDeniedException(
        message: String, cause: Throwable? = null
    ) : IONGLOCException(message, cause)
    class IONGLOCGoogleServicesException(
        val resolvable: Boolean,
        message: String, cause: Throwable? = null
    ) : IONGLOCException(message, cause)
    class IONGLOCInvalidTimeoutException(
        message: String, cause: Throwable? = null
    ) : IONGLOCException(message, cause)
    class IONGLOCLocationRetrievalTimeoutException(
        message: String, cause: Throwable? = null
    ) : IONGLOCException(message, cause)
    class IONGLOCLocationAndNetworkDisabledException(
        message: String, cause: Throwable? = null
    ) : IONGLOCException(message, cause)
}
