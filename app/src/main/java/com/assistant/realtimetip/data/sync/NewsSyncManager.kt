package com.assistant.realtimetip.data.sync

import android.util.Xml
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import com.assistant.realtimetip.data.repository.KnowledgeRepository
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import com.assistant.realtimetip.data.util.HtmlSanitizer
import com.assistant.realtimetip.data.util.KeywordExtractor
import com.assistant.realtimetip.data.util.TextSummarizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Fetches and parses RSS feeds (Google News Korea RSS + custom feeds),
 * cleans HTML summaries, extracts keywords, and stores deduplicated items in Room DB.
 */
class NewsSyncManager(
    private val securePreferenceManager: SecurePreferenceManager,
    private val knowledgeRepository: KnowledgeRepository
) {

    private val rfc822DateFormat = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.ENGLISH)
    private val isoDateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault())

    /**
     * Synchronizes news from all configured RSS feeds.
     * Returns the total count of newly inserted news items.
     */
    suspend fun syncNews(): Result<Int> = withContext(Dispatchers.IO) {
        val feedUrls = securePreferenceManager.getAllRssUrls()
        var totalInserted = 0

        for (url in feedUrls) {
            try {
                val inserted = fetchAndParseFeed(url)
                totalInserted += inserted
            } catch (e: Exception) {
                // Log and continue with next feed
                e.printStackTrace()
            }
        }

        Result.success(totalInserted)
    }

    private suspend fun fetchAndParseFeed(feedUrl: String): Int {
        var connection: HttpURLConnection? = null
        var inputStream: InputStream? = null
        var insertedCount = 0

        try {
            val url = URL(feedUrl)
            connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 10000
                readTimeout = 15000
                requestMethod = "GET"
                setRequestProperty("User-Agent", "Mozilla/5.0 (Android; Mobile; rv:109.0) Gecko/109.0 Firefox/119.0")
                setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8")
            }

            if (connection.responseCode in 200..299) {
                inputStream = connection.inputStream
                val newsItems = parseRssXml(inputStream)

                for (item in newsItems) {
                    if (item.title.isBlank()) continue

                    // Deduplication check
                    if (knowledgeRepository.existsByTitleAndSource(item.title, "NEWS")) {
                        continue
                    }

                    // Extract concise 1~3 line summary (avoiding verbose article text)
                    val conciseSummary = TextSummarizer.summarizeNews(item.content, title = item.title)
                    val combinedText = "${item.title} $conciseSummary"
                    val keywords = KeywordExtractor.extractKeywords(combinedText, maxKeywords = 15)

                    // Store ONLY headline, timestamp, publisher, and 1~3 line summary
                    val knowledgeItem = KnowledgeItem(
                        sourceType = "NEWS",
                        title = item.title,
                        senderOrSource = item.senderOrSource.ifBlank { "Google News" },
                        content = conciseSummary,
                        keywords = keywords,
                        timestamp = item.timestamp
                    )

                    knowledgeRepository.insertItem(knowledgeItem)
                    insertedCount++
                }
            }
        } finally {
            try {
                inputStream?.close()
            } catch (_: Exception) {}
            try {
                connection?.disconnect()
            } catch (_: Exception) {}
        }

        return insertedCount
    }

    private data class ParsedRssItem(
        val title: String,
        val senderOrSource: String,
        val content: String,
        val timestamp: Long
    )

    private fun parseRssXml(inputStream: InputStream): List<ParsedRssItem> {
        val items = mutableListOf<ParsedRssItem>()
        val parser = Xml.newPullParser().apply {
            setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            setInput(inputStream, null)
        }

        var eventType = parser.eventType
        var insideItem = false

        var currentTitle = ""
        var currentSource = ""
        var currentDescription = ""
        var currentPubDate = ""

        while (eventType != XmlPullParser.END_DOCUMENT) {
            val tagName = parser.name

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    if (tagName.equals("item", ignoreCase = true) || tagName.equals("entry", ignoreCase = true)) {
                        insideItem = true
                        currentTitle = ""
                        currentSource = ""
                        currentDescription = ""
                        currentPubDate = ""
                    } else if (insideItem) {
                        when {
                            tagName.equals("title", ignoreCase = true) -> {
                                currentTitle = readText(parser)
                            }
                            tagName.equals("source", ignoreCase = true) -> {
                                currentSource = readText(parser)
                            }
                            tagName.equals("description", ignoreCase = true) ||
                            tagName.equals("summary", ignoreCase = true) ||
                            tagName.equals("content", ignoreCase = true) -> {
                                currentDescription = readText(parser)
                            }
                            tagName.equals("pubDate", ignoreCase = true) ||
                            tagName.equals("published", ignoreCase = true) ||
                            tagName.equals("updated", ignoreCase = true) -> {
                                currentPubDate = readText(parser)
                            }
                        }
                    }
                }
                XmlPullParser.END_TAG -> {
                    if (tagName.equals("item", ignoreCase = true) || tagName.equals("entry", ignoreCase = true)) {
                        insideItem = false

                        // Split Google News title format: "뉴스 제목 - 매체명"
                        var cleanTitle = currentTitle.trim()
                        var detectedSource = currentSource.trim()

                        if (cleanTitle.contains(" - ") && detectedSource.isBlank()) {
                            val lastDashIndex = cleanTitle.lastIndexOf(" - ")
                            if (lastDashIndex > 0) {
                                detectedSource = cleanTitle.substring(lastDashIndex + 3).trim()
                                cleanTitle = cleanTitle.substring(0, lastDashIndex).trim()
                            }
                        }

                        val parsedTimestamp = parseDate(currentPubDate)

                        if (cleanTitle.isNotBlank()) {
                            items.add(
                                ParsedRssItem(
                                    title = cleanTitle,
                                    senderOrSource = detectedSource,
                                    content = currentDescription,
                                    timestamp = parsedTimestamp
                                )
                            )
                        }
                    }
                }
            }
            eventType = parser.next()
        }

        return items
    }

    private fun readText(parser: XmlPullParser): String {
        var result = ""
        if (parser.next() == XmlPullParser.TEXT) {
            result = parser.text ?: ""
            parser.nextTag()
        }
        return result
    }

    private fun parseDate(dateStr: String): Long {
        if (dateStr.isBlank()) return System.currentTimeMillis()
        return try {
            rfc822DateFormat.parse(dateStr)?.time ?: System.currentTimeMillis()
        } catch (e: Exception) {
            try {
                isoDateFormat.parse(dateStr)?.time ?: System.currentTimeMillis()
            } catch (e2: Exception) {
                System.currentTimeMillis()
            }
        }
    }
}
