package com.memomind.host.messengerreply

import android.app.Notification
import android.net.Uri
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** Configure the exact Muse AI package when another same-named app is used. */
data class MessengerConfig(
    val musePackageNames: Set<String> = emptySet(),
) {
    fun detect(packageName: String, notification: Notification): String? = when {
        packageName == "jp.naver.line.android" -> "line"
        packageName == "com.kakao.talk" -> "kakaotalk"
        packageName in setOf(
            "org.telegram.messenger",
            "org.telegram.messenger.web",
            "org.thunderdog.challegram",
        ) -> "telegram"
        packageName == "com.museai.asst.mobile" -> "muse-ai"
        packageName in musePackageNames -> "muse-ai"
        else -> null
    }

    fun label(id: String): String = when (id) {
        "kakaotalk" -> "카카오톡"
        "telegram" -> "Telegram"
        "line" -> "LINE"
        "muse-ai" -> "뮤즈AI"
        else -> id
    }
}

/**
 * Product Host implementation: MemoMind Opus capture -> decode -> on-device STT.
 * It must never silently fall back to a network recognizer.
 */
interface GlassesOfflineSpeechRecognizer {
    fun start(locale: Locale, callback: Callback)
    /** Stop capture, flush final audio, then invoke the active callback once. */
    fun stop()

    interface Callback {
        fun onResult(text: String)
        fun onError(message: String)
    }
}

object MemoMessengerRuntime {
    private const val PLUGIN_ID = "com.memomind.demo.messenger-glass-reply"
    private const val BRIDGE_NAME = "MemoMessengerHost"
    private const val MAX_REQUEST_CHARS = 4096
    private const val MAX_REPLY_CHARS = 500
    private val REQUEST_ID = Regex("^[A-Za-z0-9_-]{1,64}$")
    private val KEY = Regex("^[^\\u0000-\\u001f]{1,512}$")

    private data class Binding(
        val webView: WebView,
        val generation: Long,
        val origin: Uri,
    )

    private data class SpeechSession(
        val generation: Long,
        val notificationKey: String,
    )

    @Volatile var config: MessengerConfig = MessengerConfig()
    @Volatile var recognizer: GlassesOfflineSpeechRecognizer? = null

    private val nextGeneration = AtomicLong(0)
    private val binding = AtomicReference<Binding?>()
    private val activeNotificationKey = AtomicReference<String?>()
    private val speechSession = AtomicReference<SpeechSession?>()

    /**
     * Serve this plugin through a dedicated HTTPS asset origin first. file://,
     * content://, external navigation and subframe calls must remain disabled.
     */
    fun attach(pluginId: String, webView: WebView, allowedOrigin: String) {
        require(pluginId == PLUGIN_ID) { "MemoMessengerHost may only be attached to $PLUGIN_ID" }
        val origin = Uri.parse(allowedOrigin)
        require(origin.scheme == "https" && !origin.host.isNullOrBlank()) {
            "MemoMessengerHost requires a dedicated HTTPS asset origin"
        }
        require(origin.path.isNullOrEmpty() && origin.query == null && origin.fragment == null) {
            "allowedOrigin must contain only scheme, host and optional port"
        }

        detachCurrent()
        val current = Binding(webView, nextGeneration.incrementAndGet(), origin)
        binding.set(current)
        WebViewCompat.addWebMessageListener(
            webView,
            BRIDGE_NAME,
            setOf(origin.toString()),
        ) { _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || sourceOrigin != origin || binding.get() !== current) {
                return@addWebMessageListener
            }
            handleRequest(current, message.data.orEmpty())
        }
    }

    fun detach(webView: WebView) {
        if (binding.get()?.webView !== webView) return
        detachCurrent()
    }

    fun post(event: PostedMessengerNotification, target: ReplyTarget?) {
        val current = binding.get() ?: return
        // A replaced notification invalidates a draft before exposing its new action.
        if (activeNotificationKey.get() == event.key) remove(event.key)
        NotificationReplies.put(event.key, target)
        postToWeb(
            current.generation,
            JSONObject().put("type", "notification.posted").put("notification", event.toJson()),
        )
    }

    fun remove(key: String) {
        NotificationReplies.remove(key)
        if (activeNotificationKey.compareAndSet(key, null)) cancelSpeech()
        postToWeb(binding.get()?.generation, JSONObject().put("type", "notification.removed").put("key", key))
    }

    private fun handleRequest(current: Binding, raw: String) {
        runCatching {
            require(raw.length in 1..MAX_REQUEST_CHARS) { "요청 크기가 잘못되었습니다." }
            val request = JSONObject(raw)
            val id = request.getString("id")
            require(REQUEST_ID.matches(id)) { "요청 ID가 잘못되었습니다." }
            when (request.getString("type")) {
                "notification.deselect" -> {
                    cancelSpeech()
                    activeNotificationKey.set(null)
                    respond(current.generation, id, true)
                }
                "notification.select" -> {
                    val key = request.getString("key")
                    require(KEY.matches(key) && NotificationReplies.contains(key)) { "답장 대상이 만료되었습니다." }
                    cancelSpeech()
                    activeNotificationKey.set(key)
                    respond(current.generation, id, true)
                }
                "notification.reply" -> handleReply(current, id, request)
                "speech.toggle" -> handleSpeechToggle(current, id, request)
                "speech.cancel" -> {
                    cancelSpeech()
                    respond(current.generation, id, true)
                }
                else -> error("지원하지 않는 Host 요청입니다.")
            }
        }.onFailure { error ->
            val id = runCatching { JSONObject(raw).optString("id") }
                .getOrNull()?.takeIf(REQUEST_ID::matches)
            if (id != null) respond(current.generation, id, false, error.message)
        }
    }

    private fun handleReply(current: Binding, id: String, request: JSONObject) {
        val key = request.getString("key")
        val text = request.getString("text").trim()
        require(KEY.matches(key) && key == activeNotificationKey.get()) {
            "현재 활성 알림과 일치하지 않습니다."
        }
        require(text.isNotEmpty() && text.length <= MAX_REPLY_CHARS) {
            "답장 길이가 잘못되었습니다."
        }
        cancelSpeech()
        val result = NotificationReplies.send(key, text)
        respond(current.generation, id, result.isSuccess, result.exceptionOrNull()?.message)
    }

    private fun handleSpeechToggle(current: Binding, id: String, request: JSONObject) {
        val key = request.getString("key")
        require(KEY.matches(key) && key == activeNotificationKey.get()) {
            "현재 활성 알림과 일치하지 않습니다."
        }
        val existing = speechSession.get()
        if (existing != null) {
            require(existing.generation == current.generation && existing.notificationKey == key) {
                "다른 음성 세션이 활성 상태입니다."
            }
            finishSpeech()
            respond(current.generation, id, true, active = false)
            return
        }

        val engine = recognizer ?: error("온디바이스 STT가 연결되지 않았습니다.")
        val languageTag = request.optString("languageTag", "ko-KR")
        require(languageTag.length in 2..35) { "언어 태그가 잘못되었습니다." }
        val session = SpeechSession(current.generation, key)
        require(speechSession.compareAndSet(null, session)) { "음성 세션이 사용 중입니다." }

        try {
            engine.start(Locale.forLanguageTag(languageTag), object : GlassesOfflineSpeechRecognizer.Callback {
                override fun onResult(text: String) {
                    if (!speechSession.compareAndSet(session, null)) return
                    if (binding.get()?.generation != session.generation ||
                        activeNotificationKey.get() != session.notificationKey) return
                    postToWeb(
                        session.generation,
                        JSONObject().put("type", "speech.result")
                            .put("key", session.notificationKey)
                            .put("text", text.take(MAX_REPLY_CHARS)),
                    )
                }

                override fun onError(message: String) {
                    if (!speechSession.compareAndSet(session, null)) return
                    if (binding.get()?.generation != session.generation ||
                        activeNotificationKey.get() != session.notificationKey) return
                    postToWeb(
                        session.generation,
                        JSONObject().put("type", "speech.error")
                            .put("key", session.notificationKey)
                            .put("message", message.take(300)),
                    )
                }
            })
            respond(current.generation, id, true, active = speechSession.get() === session)
        } catch (error: Throwable) {
            speechSession.compareAndSet(session, null)
            respond(current.generation, id, false, error.message)
        }
    }

    private fun respond(generation: Long, id: String, ok: Boolean, error: String? = null, active: Boolean? = null) {
        postToWeb(
            generation,
            JSONObject().put("type", "response").put("id", id).put("ok", ok)
                .apply {
                    if (!ok) put("error", error ?: "요청 실패")
                    if (active != null) put("active", active)
                },
        )
    }

    private fun postToWeb(generation: Long?, payload: JSONObject) {
        if (generation == null) return
        val current = binding.get() ?: return
        if (current.generation != generation) return
        current.webView.post {
            if (binding.get() !== current) return@post
            WebViewCompat.postWebMessage(
                current.webView,
                WebMessageCompat(payload.toString()),
                current.origin,
            )
        }
    }

    private fun finishSpeech() {
        if (speechSession.get() != null) runCatching { recognizer?.stop() }
    }

    private fun cancelSpeech() {
        if (speechSession.getAndSet(null) != null) runCatching { recognizer?.stop() }
    }

    private fun detachCurrent() {
        val current = binding.getAndSet(null) ?: return
        cancelSpeech()
        activeNotificationKey.set(null)
        NotificationReplies.clear()
        runCatching { WebViewCompat.removeWebMessageListener(current.webView, BRIDGE_NAME) }
    }
}

