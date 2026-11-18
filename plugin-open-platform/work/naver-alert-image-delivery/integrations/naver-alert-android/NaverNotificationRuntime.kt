package com.mcnex.naveralert

import android.net.Uri
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import org.json.JSONObject

/**
 * Attach ONLY to the trusted plugin WebView. Host must block external navigation
 * and invoke detach before navigation, suspension, destruction or plugin switch.
 * No notification data is cached or persisted.
 */
object NaverNotificationRuntime {
    private const val ID = "com.mcnex.naver-alert-image"
    private data class Binding(val view: WebView, val origin: Uri, var ready: Boolean = false)
    @Volatile private var binding: Binding? = null

    fun attach(pluginId: String, view: WebView, allowedOrigin: String) {
        require(pluginId == ID)
        val origin = Uri.parse(allowedOrigin)
        require(origin.scheme == "https" && !origin.host.isNullOrBlank())
        require(origin.userInfo == null && origin.query == null && origin.fragment == null &&
            origin.path.isNullOrEmpty()) { "Use a dedicated HTTPS origin without a path" }
        detach()
        val current = Binding(view, origin)
        binding = current
        WebViewCompat.addWebMessageListener(view, "MemoNaverHost", setOf(allowedOrigin)) {
            _, message, source, mainFrame, _ ->
            if (binding === current && mainFrame && sameOrigin(source, origin) &&
                message.data == "ready") current.ready = true
        }
    }

    fun detach() {
        val previous = binding
        binding = null
        if (previous != null) WebViewCompat.removeWebMessageListener(previous.view, "MemoNaverHost")
    }

    private fun sameOrigin(a: Uri, b: Uri) =
        a.scheme == b.scheme && a.host == b.host && a.port == b.port

    fun emit(event: JSONObject) {
        val current = binding ?: return
        // Serialized data is a quoted JS string; line separators are escaped.
        val literal = JSONObject.quote(event.toString())
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        current.view.post {
            if (binding === current && current.ready &&
                sameOrigin(Uri.parse(current.view.url.orEmpty()), current.origin)) {
                current.view.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('memo-naver-notification'," +
                    "{detail:JSON.parse($literal)}));", null)
            }
        }
    }
}
