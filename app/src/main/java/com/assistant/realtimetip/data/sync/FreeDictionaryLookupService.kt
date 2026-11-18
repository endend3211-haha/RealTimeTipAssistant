package com.assistant.realtimetip.data.sync

import android.content.Context
import android.util.Log
import com.assistant.realtimetip.data.local.dao.DictionaryDao
import com.assistant.realtimetip.data.local.entity.DictionaryEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Lightweight Asynchronous Free Dictionary Lookup Service (No API Key Required).
 * - Korean & Multilingual terms: Wiktionary REST API (https://ko.wiktionary.org/api/rest_v1/page/definition/{word})
 * - English & Technical terms: Free Dictionary API (https://api.dictionaryapi.dev/api/v2/entries/en/{word})
 *
 * Caches fetched definitions in Room Database (dictionary_cache) for zero-latency repeat lookups.
 */
class FreeDictionaryLookupService(
    private val dictionaryDao: DictionaryDao
) {
    companion object {
        private const val TAG = "FreeDictionaryLookup"
        private const val CONNECT_TIMEOUT_MS = 2500
        private const val READ_TIMEOUT_MS = 3000
    }

    /**
     * Looks up definition for the given term, checking Room cache first.
     */
    suspend fun lookupDefinition(term: String): String? = withContext(Dispatchers.IO) {
        val cleanWord = term.trim().replace(Regex("""[^a-zA-Z0-9가-힣]"""), "")
        if (cleanWord.length < 2) return@withContext null

        // 1. Check local Room cache (Ignore stale disambiguation entries)
        try {
            val cached = dictionaryDao.getDefinition(cleanWord)
            if (cached != null &&
                cached.definition.isNotBlank() &&
                !cached.definition.contains("동음이의") &&
                !cached.definition.contains("위키미디어")
            ) {
                return@withContext cached.definition
            }
        } catch (_: Exception) {}

        // 2. Determine language: English (pure ASCII letters) vs Korean/Multilingual
        val isEnglish = cleanWord.all { it in 'a'..'z' || it in 'A'..'Z' || it.isDigit() }

        val definition = if (isEnglish) {
            lookupEnglishDefinition(cleanWord)
        } else {
            lookupKoreanDefinition(cleanWord)
        }

        // 3. Cache valid definition (Never cache disambiguation metadata)
        if (!definition.isNullOrBlank() &&
            !definition.contains("동음이의") &&
            !definition.contains("위키미디어")
        ) {
            try {
                dictionaryDao.insertDefinition(
                    DictionaryEntry(
                        word = cleanWord,
                        definition = definition,
                        language = if (isEnglish) "en" else "ko"
                    )
                )
            } catch (_: Exception) {}
        }

        return@withContext definition
    }

    /**
     * Queries Free Dictionary API (https://api.dictionaryapi.dev/api/v2/entries/en/{word})
     */
    private fun lookupEnglishDefinition(word: String): String? {
        var conn: HttpURLConnection? = null
        return try {
            val encoded = URLEncoder.encode(word.lowercase(), "UTF-8")
            val url = URL("https://api.dictionaryapi.dev/api/v2/entries/en/$encoded")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("User-Agent", "MemoMind-RealTimeAssistant/1.1")
                setRequestProperty("Accept", "application/json")
            }

            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val rootArray = JSONArray(body)
                if (rootArray.length() > 0) {
                    val entry = rootArray.getJSONObject(0)
                    val meanings = entry.optJSONArray("meanings")
                    if (meanings != null && meanings.length() > 0) {
                        val firstMeaning = meanings.getJSONObject(0)
                        val pos = firstMeaning.optString("partOfSpeech", "")
                        val defs = firstMeaning.optJSONArray("definitions")
                        if (defs != null && defs.length() > 0) {
                            val defText = defs.getJSONObject(0).optString("definition", "").trim()
                            if (defText.isNotBlank()) {
                                val posPrefix = if (pos.isNotBlank()) "($pos) " else ""
                                return cleanDefinitionText("$posPrefix$defText")
                            }
                        }
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.d(TAG, "English dictionary lookup failed for $word: ${e.message}")
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    /**
     * Queries Wikimedia Knowledge Summary API (https://ko.wikipedia.org/api/rest_v1/page/summary/{word})
     * to fetch instant 1-line encyclopedic dictionary definitions.
     * Intercepts disambiguation pages ("동음이의어 문서") and auto-resolves top-1 link with 200ms timeout.
     */
    private suspend fun lookupKoreanDefinition(word: String, allowAutoResolve: Boolean = true): String? {
        var conn: HttpURLConnection? = null
        return try {
            val encoded = URLEncoder.encode(word, "UTF-8")
            val url = URL("https://ko.wikipedia.org/api/rest_v1/page/summary/$encoded")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("User-Agent", "MemoMind-RealTimeAssistant/1.1 (assistant@memomind.com)")
                setRequestProperty("Accept", "application/json")
            }

            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val root = JSONObject(body)
                val type = root.optString("type", "").trim()
                val description = root.optString("description", "").trim()
                val extract = root.optString("extract", "").trim()

                // 1. Disambiguation Detection: Flag if type is disambiguation or text contains "동음이의"
                val isDisambiguation = type.equals("disambiguation", ignoreCase = true) ||
                    description.contains("동음이의") ||
                    extract.contains("동음이의")

                if (isDisambiguation) {
                    Log.i(TAG, "Disambiguation detected for '$word' (type=$type, desc='$description'). Intercepting...")
                    if (allowAutoResolve) {
                        // 2. Auto-Resolve: Extract Top-1 article link from disambiguation list within 200ms
                        val resolved = autoResolveDisambiguation(word)
                        if (!resolved.isNullOrBlank() && !resolved.contains("동음이의") && !resolved.contains("위키미디어")) {
                            Log.i(TAG, "Disambiguation for '$word' successfully auto-resolved to: '$resolved'")
                            return cleanDefinitionText(resolved)
                        }
                    }
                    // 3. Fallback: Drop dictionary result entirely to allow 2nd-priority Web Search fallback
                    Log.i(TAG, "Auto-resolve for '$word' failed/timed out. Dropping dictionary result for Web Search fallback.")
                    return null
                }

                // Priority: Use concise 1-line description if available
                if (description.isNotBlank() && !description.contains("동음이의") && !description.contains("위키미디어")) {
                    return cleanDefinitionText(description)
                }

                // Fallback: Use first sentence of the extract summary
                if (extract.isNotBlank() && !extract.contains("동음이의") && !extract.contains("위키미디어")) {
                    val firstSentence = extract.split(Regex("""(?<=[.!?])\s+""")).firstOrNull()?.trim() ?: extract
                    return cleanDefinitionText(firstSentence)
                }
            }
            null
        } catch (e: Exception) {
            Log.d(TAG, "Korean dictionary lookup failed for $word: ${e.message}")
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    /**
     * Programmatically extracts the very first actual article link from a disambiguation page.
     * Enforces a hard 200ms timeout to avoid pipeline latency.
     */
    private suspend fun autoResolveDisambiguation(word: String): String? = withTimeoutOrNull(200L) {
        var conn: HttpURLConnection? = null
        try {
            val encoded = URLEncoder.encode(word, "UTF-8")
            val url = URL("https://ko.wikipedia.org/api/rest_v1/page/html/$encoded")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 180
                readTimeout = 180
                requestMethod = "GET"
                setRequestProperty("User-Agent", "MemoMind-RealTimeAssistant/1.1 (assistant@memomind.com)")
                setRequestProperty("Accept", "text/html")
            }

            if (conn.responseCode in 200..299) {
                val html = conn.inputStream.bufferedReader().use { it.readText() }

                // Find list items in the disambiguation HTML: <li ...>(.*?)</li>
                val liPattern = Regex("""<li[^>]*>(.*?)</li>""", RegexOption.DOT_MATCHES_ALL)
                for (match in liPattern.findAll(html)) {
                    val liHtml = match.groupValues[1]

                    // Extract first article link <a rel="mw:WikiLink" href="./Target" title="Target">
                    val aPattern = Regex("""<a\s+[^>]*href="\./([^"#]+)"[^>]*title="([^"]+)"""")
                    val aMatch = aPattern.find(liHtml)
                    if (aMatch != null) {
                        val targetTitle = aMatch.groupValues[2].trim()
                        if (targetTitle.isNotBlank() &&
                            !targetTitle.equals(word, ignoreCase = true) &&
                            !targetTitle.contains("동음이의") &&
                            !targetTitle.contains("목록") &&
                            !targetTitle.contains("위키백과") &&
                            !targetTitle.contains("특수:")
                        ) {
                            // Option A: Extract substantive 1-line definition directly from <li> text if available
                            val cleanLiText = cleanDefinitionText(liHtml)
                            if (cleanLiText.length in 10..120 &&
                                !cleanLiText.contains("동음이의") &&
                                !cleanLiText.contains("위키미디어")
                            ) {
                                return@withTimeoutOrNull cleanLiText
                            }

                            // Option B: Query summary of that top-1 target article directly
                            val subDef = lookupKoreanDefinition(targetTitle, allowAutoResolve = false)
                            if (!subDef.isNullOrBlank() &&
                                !subDef.contains("동음이의") &&
                                !subDef.contains("위키미디어")
                            ) {
                                return@withTimeoutOrNull subDef
                            }
                        }
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.d(TAG, "Disambiguation auto-resolve error for '$word': ${e.message}")
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    private fun cleanDefinitionText(raw: String): String {
        return raw
            .replace(Regex("""<[^>]*>"""), "") // Strip HTML tags like <p>, <a>
            .replace("&quot;", "\"")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace(Regex("""\s+"""), " ")
            .trim()
            .take(150)
    }
}
