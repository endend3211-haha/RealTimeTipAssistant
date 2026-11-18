package com.assistant.realtimetip.data.sync

import android.util.Xml
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import com.assistant.realtimetip.data.util.HtmlSanitizer
import com.assistant.realtimetip.data.util.TextSummarizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Real-time Web Search Manager supporting Keyless RSS Search (default)
 * and Naver Search API with encrypted credentials.
 */
class WebSearchManager(
    private val securePreferenceManager: SecurePreferenceManager
) {

    /**
     * Executes real-time web search for the given query, returning up to [limit] KnowledgeItem snippets.
     */
    suspend fun search(query: String, limit: Int = 3): List<KnowledgeItem> = withContext(Dispatchers.IO) {
        val trimmedQuery = query.trim()
        if (trimmedQuery.isBlank()) return@withContext emptyList()

        val provider = securePreferenceManager.webSearchProvider

        if (provider.equals("NAVER_API", ignoreCase = true)) {
            val clientId = securePreferenceManager.naverClientId
            val clientSecret = securePreferenceManager.naverClientSecret
            if (clientId.isNotBlank() && clientSecret.isNotBlank()) {
                val naverResults = searchNaverApi(trimmedQuery, clientId, clientSecret, limit)
                if (naverResults.isNotEmpty()) {
                    return@withContext naverResults
                }
            }
        }

        // Fallback or default: Keyless Google Search RSS
        searchKeylessRss(trimmedQuery, limit)
    }

    /**
     * Tests connectivity for the active web search provider.
     */
    suspend fun testConnection(): Result<String> = withContext(Dispatchers.IO) {
        val provider = securePreferenceManager.webSearchProvider
        val testQuery = "인공지능"

        try {
            if (provider.equals("NAVER_API", ignoreCase = true)) {
                val clientId = securePreferenceManager.naverClientId
                val clientSecret = securePreferenceManager.naverClientSecret

                if (clientId.isBlank() || clientSecret.isBlank()) {
                    return@withContext Result.failure(
                        IllegalArgumentException("네이버 Client ID와 Client Secret을 모두 입력해주세요.")
                    )
                }

                val results = searchNaverApi(testQuery, clientId, clientSecret, limit = 1)
                if (results.isNotEmpty()) {
                    Result.success("네이버 웹 검색 API 연결 성공 (검색 확인됨)")
                } else {
                    Result.failure(Exception("네이버 검색 API 호출 응답이 비어있습니다. 키 권한을 확인해주세요."))
                }
            } else {
                val results = searchKeylessRss(testQuery, limit = 1)
                if (results.isNotEmpty()) {
                    Result.success("무키 RSS 실시간 웹 검색 연결 성공 (정상 작동)")
                } else {
                    Result.failure(Exception("웹 검색 피드 연결에 실패했습니다. 네트워크 상태를 확인해주세요."))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun searchKeylessRss(query: String, limit: Int): List<KnowledgeItem> {
        val results = mutableListOf<KnowledgeItem>()
        var connection: HttpURLConnection? = null
        var inputStream: InputStream? = null

        try {
            val encodedQuery = URLEncoder.encode(query, "UTF-8")
            val urlStr = "https://news.google.com/rss/search?q=$encodedQuery&hl=ko&gl=KR&ceid=KR:ko"
            val url = URL(urlStr)

            connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 1500
                readTimeout = 2500
                requestMethod = "GET"
                setRequestProperty("User-Agent", "Mozilla/5.0 (Android; Mobile; rv:109.0) Gecko/109.0 Firefox/119.0")
            }

            if (connection.responseCode in 200..299) {
                inputStream = connection.inputStream
                val parsedItems = parseRssItems(inputStream, limit)

                for (item in parsedItems) {
                    val summary = TextSummarizer.summarizeNews(item.description, item.title)
                    results.add(
                        KnowledgeItem(
                            sourceType = "WEB",
                            title = item.title,
                            senderOrSource = item.source.ifBlank { "웹 검색" },
                            content = summary,
                            keywords = query,
                            timestamp = System.currentTimeMillis()
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            try { inputStream?.close() } catch (_: Exception) {}
            try { connection?.disconnect() } catch (_: Exception) {}
        }

        return results
    }

    private fun searchNaverApi(
        query: String,
        clientId: String,
        clientSecret: String,
        limit: Int
    ): List<KnowledgeItem> {
        val results = mutableListOf<KnowledgeItem>()
        var connection: HttpURLConnection? = null

        try {
            val encodedQuery = URLEncoder.encode(query, "UTF-8")
            val urlStr = "https://openapi.naver.com/v1/search/webkr.json?query=$encodedQuery&display=$limit"
            val url = URL(urlStr)

            connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 5000
                readTimeout = 8000
                requestMethod = "GET"
                setRequestProperty("X-Naver-Client-Id", clientId)
                setRequestProperty("X-Naver-Client-Secret", clientSecret)
            }

            if (connection.responseCode in 200..299) {
                val responseText = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(responseText)
                val items = json.optJSONArray("items") ?: return emptyList()

                for (i in 0 until items.length().coerceAtMost(limit)) {
                    val item = items.getJSONObject(i)
                    val rawTitle = item.optString("title", "")
                    val rawDesc = item.optString("description", "")

                    val cleanTitle = HtmlSanitizer.stripHtml(rawTitle)
                    val cleanDesc = HtmlSanitizer.stripHtml(rawDesc)
                    val summary = TextSummarizer.summarizeNews(cleanDesc, cleanTitle)

                    if (cleanTitle.isNotBlank()) {
                        results.add(
                            KnowledgeItem(
                                sourceType = "WEB",
                                title = cleanTitle,
                                senderOrSource = "네이버 웹",
                                content = summary,
                                keywords = query,
                                timestamp = System.currentTimeMillis()
                            )
                        )
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            try { connection?.disconnect() } catch (_: Exception) {}
        }

        return results
    }

    private data class TempRssItem(
        val title: String,
        val description: String,
        val source: String
    )

    private fun parseRssItems(inputStream: InputStream, limit: Int): List<TempRssItem> {
        val list = mutableListOf<TempRssItem>()
        val parser = Xml.newPullParser().apply {
            setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            setInput(inputStream, null)
        }

        var eventType = parser.eventType
        var insideItem = false
        var curTitle = ""
        var curDesc = ""
        var curSource = ""

        while (eventType != XmlPullParser.END_DOCUMENT && list.size < limit) {
            val name = parser.name
            when (eventType) {
                XmlPullParser.START_TAG -> {
                    if (name.equals("item", ignoreCase = true)) {
                        insideItem = true
                        curTitle = ""
                        curDesc = ""
                        curSource = ""
                    } else if (insideItem) {
                        when {
                            name.equals("title", ignoreCase = true) -> curTitle = readText(parser)
                            name.equals("description", ignoreCase = true) -> curDesc = readText(parser)
                            name.equals("source", ignoreCase = true) -> curSource = readText(parser)
                        }
                    }
                }
                XmlPullParser.END_TAG -> {
                    if (name.equals("item", ignoreCase = true)) {
                        insideItem = false
                        var cleanTitle = HtmlSanitizer.stripHtml(curTitle)
                        var detectedSource = curSource.trim()

                        if (cleanTitle.contains(" - ") && detectedSource.isBlank()) {
                            val lastIdx = cleanTitle.lastIndexOf(" - ")
                            if (lastIdx > 0) {
                                detectedSource = cleanTitle.substring(lastIdx + 3).trim()
                                cleanTitle = cleanTitle.substring(0, lastIdx).trim()
                            }
                        }

                        if (cleanTitle.isNotBlank()) {
                            list.add(
                                TempRssItem(
                                    title = cleanTitle,
                                    description = curDesc,
                                    source = detectedSource.ifBlank { "웹 검색" }
                                )
                            )
                        }
                    }
                }
            }
            eventType = parser.next()
        }

        return list
    }

    private fun readText(parser: XmlPullParser): String {
        var res = ""
        if (parser.next() == XmlPullParser.TEXT) {
            res = parser.text ?: ""
            parser.nextTag()
        }
        return res
    }
}
