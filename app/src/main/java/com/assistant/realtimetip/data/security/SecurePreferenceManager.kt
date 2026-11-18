package com.assistant.realtimetip.data.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Manages securely encrypted credentials and application settings
 * using AndroidX Security Crypto (AES-256 GCM).
 */
class SecurePreferenceManager(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    companion object {
        private const val PREFS_NAME = "encrypted_assistant_prefs"

        // Email IMAP keys
        private const val KEY_IMAP_HOST = "imap_host"
        private const val KEY_IMAP_PORT = "imap_port"
        private const val KEY_IMAP_EMAIL = "imap_email"
        private const val KEY_IMAP_PASSWORD = "imap_password"
        private const val KEY_IMAP_LOOKBACK_DAYS = "imap_lookback_days"
        private const val KEY_IMAP_PRESET = "imap_preset" // "GMAIL", "NAVER", "CUSTOM"

        // News RSS keys
        private const val KEY_CUSTOM_RSS_URLS = "custom_rss_urls"

        // Knowledge Source Switches
        private const val KEY_STOCK_ENABLED = "knowledge_stock_enabled"
        private const val KEY_WEB_SEARCH_ENABLED = "knowledge_web_search_enabled"
        private const val KEY_EMAIL_ENABLED = "knowledge_email_enabled"
        private const val KEY_NEWS_ENABLED = "knowledge_news_enabled"
        private const val KEY_CALENDAR_ENABLED = "knowledge_calendar_enabled"
        private const val KEY_CONTACTS_ENABLED = "knowledge_contacts_enabled"
        private const val KEY_CALL_ENABLED = "knowledge_call_enabled"
        private const val KEY_DICTIONARY_ENABLED = "knowledge_dictionary_enabled"

        // Web Search Provider Settings
        private const val KEY_WEB_SEARCH_PROVIDER = "web_search_provider" // "KEYLESS_RSS" or "NAVER_API"
        private const val KEY_NAVER_CLIENT_ID = "naver_client_id"
        private const val KEY_NAVER_CLIENT_SECRET = "naver_client_secret"

        // Sync Frequency
        private const val KEY_SYNC_INTERVAL_MINUTES = "sync_interval_minutes"

        // STT & Recognition settings (Step 3 & 5 preparation)
        private const val KEY_STT_CONTINUOUS_LISTENING = "stt_continuous_listening"
        private const val KEY_STT_BIASING_ENABLED = "stt_biasing_enabled"
        private const val KEY_STT_JAMO_THRESHOLD = "stt_jamo_threshold"
        private const val KEY_CUSTOM_DICTIONARY = "custom_dictionary" // JSON or delimited
        private const val KEY_PREFER_BLUETOOTH_MIC = "audio_prefer_bluetooth_mic"

        // LLM settings (Step 4 preparation)
        private const val KEY_LLM_MODEL_PATH = "llm_model_path"
        private const val KEY_LLM_THREADS = "llm_threads"
        private const val KEY_LLM_CONTEXT_SIZE = "llm_context_size"
        private const val KEY_LLM_TEMPERATURE = "llm_temperature"

        const val DEFAULT_IMAP_HOST = "imap.gmail.com"
        const val DEFAULT_IMAP_PORT = 993
        const val DEFAULT_LOOKBACK_DAYS = 3
        const val DEFAULT_SYNC_INTERVAL_MINUTES = 30
        const val DEFAULT_GOOGLE_NEWS_RSS = "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko"
    }

    // --- IMAP Properties ---

    var imapHost: String
        get() = sharedPreferences.getString(KEY_IMAP_HOST, DEFAULT_IMAP_HOST) ?: DEFAULT_IMAP_HOST
        set(value) = sharedPreferences.edit().putString(KEY_IMAP_HOST, value.trim()).apply()

    var imapPort: Int
        get() = sharedPreferences.getInt(KEY_IMAP_PORT, DEFAULT_IMAP_PORT)
        set(value) = sharedPreferences.edit().putInt(KEY_IMAP_PORT, value).apply()

    var imapEmail: String
        get() = sharedPreferences.getString(KEY_IMAP_EMAIL, "") ?: ""
        set(value) = sharedPreferences.edit().putString(KEY_IMAP_EMAIL, value.trim()).apply()

    var imapPassword: String
        get() = sharedPreferences.getString(KEY_IMAP_PASSWORD, "") ?: ""
        set(value) = sharedPreferences.edit().putString(KEY_IMAP_PASSWORD, value.trim()).apply()

    var imapLookbackDays: Int
        get() = sharedPreferences.getInt(KEY_IMAP_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS)
        set(value) = sharedPreferences.edit().putInt(KEY_IMAP_LOOKBACK_DAYS, value).apply()

    var imapPreset: String
        get() = sharedPreferences.getString(KEY_IMAP_PRESET, "GMAIL") ?: "GMAIL"
        set(value) = sharedPreferences.edit().putString(KEY_IMAP_PRESET, value).apply()

    // --- News RSS Properties ---

    var customRssUrls: Set<String>
        get() = sharedPreferences.getStringSet(KEY_CUSTOM_RSS_URLS, emptySet()) ?: emptySet()
        set(value) = sharedPreferences.edit().putStringSet(KEY_CUSTOM_RSS_URLS, value).apply()

    fun addCustomRssUrl(url: String) {
        val trimmed = url.trim()
        if (trimmed.isNotBlank()) {
            val updated = customRssUrls.toMutableSet()
            updated.add(trimmed)
            customRssUrls = updated
        }
    }

    fun removeCustomRssUrl(url: String) {
        val updated = customRssUrls.toMutableSet()
        updated.remove(url.trim())
        customRssUrls = updated
    }

    fun getAllRssUrls(): List<String> {
        val list = mutableListOf(DEFAULT_GOOGLE_NEWS_RSS)
        list.addAll(customRssUrls)
        return list
    }

    // --- Independent Knowledge Source Switches (All defaulting to true) ---

    var isStockEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_STOCK_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_STOCK_ENABLED, value).apply()

    var isWebSearchEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_WEB_SEARCH_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_WEB_SEARCH_ENABLED, value).apply()

    var isEmailEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_EMAIL_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_EMAIL_ENABLED, value).apply()

    var isNewsEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_NEWS_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_NEWS_ENABLED, value).apply()

    var isCalendarEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_CALENDAR_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_CALENDAR_ENABLED, value).apply()

    var isContactsEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_CONTACTS_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_CONTACTS_ENABLED, value).apply()

    var isCallEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_CALL_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_CALL_ENABLED, value).apply()

    var isDictionaryEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_DICTIONARY_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_DICTIONARY_ENABLED, value).apply()

    // --- Web Search Provider Settings ---

    var webSearchProvider: String
        get() = sharedPreferences.getString(KEY_WEB_SEARCH_PROVIDER, "KEYLESS_RSS") ?: "KEYLESS_RSS"
        set(value) = sharedPreferences.edit().putString(KEY_WEB_SEARCH_PROVIDER, value).apply()

    var naverClientId: String
        get() = sharedPreferences.getString(KEY_NAVER_CLIENT_ID, "") ?: ""
        set(value) = sharedPreferences.edit().putString(KEY_NAVER_CLIENT_ID, value.trim()).apply()

    var naverClientSecret: String
        get() = sharedPreferences.getString(KEY_NAVER_CLIENT_SECRET, "") ?: ""
        set(value) = sharedPreferences.edit().putString(KEY_NAVER_CLIENT_SECRET, value.trim()).apply()

    // --- Sync Frequency (in minutes: 15, 30, 60, or 0 for manual) ---

    var syncIntervalMinutes: Int
        get() = sharedPreferences.getInt(KEY_SYNC_INTERVAL_MINUTES, DEFAULT_SYNC_INTERVAL_MINUTES)
        set(value) = sharedPreferences.edit().putInt(KEY_SYNC_INTERVAL_MINUTES, value).apply()

    // --- STT & LLM Settings Accessors ---

    var isPreferBluetoothMicEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_PREFER_BLUETOOTH_MIC, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_PREFER_BLUETOOTH_MIC, value).apply()

    var isContinuousListeningEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_STT_CONTINUOUS_LISTENING, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_STT_CONTINUOUS_LISTENING, value).apply()

    var isBiasingEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_STT_BIASING_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_STT_BIASING_ENABLED, value).apply()

    var jamoSimilarityThreshold: Float
        get() = sharedPreferences.getFloat(KEY_STT_JAMO_THRESHOLD, 0.80f)
        set(value) = sharedPreferences.edit().putFloat(KEY_STT_JAMO_THRESHOLD, value).apply()

    var customDictionaryRaw: String
        get() = sharedPreferences.getString(KEY_CUSTOM_DICTIONARY, "") ?: ""
        set(value) = sharedPreferences.edit().putString(KEY_CUSTOM_DICTIONARY, value).apply()

    var llmModelPath: String
        get() = sharedPreferences.getString(
            KEY_LLM_MODEL_PATH,
            "/storage/emulated/0/Download/AI/EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf"
        ) ?: "/storage/emulated/0/Download/AI/EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf"
        set(value) = sharedPreferences.edit().putString(KEY_LLM_MODEL_PATH, value).apply()

    var llmThreads: Int
        get() = sharedPreferences.getInt(KEY_LLM_THREADS, 6)
        set(value) = sharedPreferences.edit().putInt(KEY_LLM_THREADS, value).apply()

    var llmContextSize: Int
        get() = sharedPreferences.getInt(KEY_LLM_CONTEXT_SIZE, 2048)
        set(value) = sharedPreferences.edit().putInt(KEY_LLM_CONTEXT_SIZE, value).apply()

    var llmTemperature: Float
        get() = sharedPreferences.getFloat(KEY_LLM_TEMPERATURE, 0.15f)
        set(value) = sharedPreferences.edit().putFloat(KEY_LLM_TEMPERATURE, value).apply()
}
