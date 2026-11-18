package com.assistant.realtimetip.data.sync

import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale

/**
 * Keyless Real-Time Market Data Client.
 * Queries live stock quotes for Korean stocks (KOSPI/KOSDAQ via Naver Finance),
 * Market Indices (KOSPI, KOSDAQ), and US Stocks / Indices (via Yahoo Finance).
 */
class StockQuoteManager {

    companion object {
        private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        private const val CONNECT_TIMEOUT_MS = 4000
        private const val READ_TIMEOUT_MS = 6000

        // Stock-related intent keywords
        private val STOCK_TRIGGER_WORDS = listOf(
            "주가", "주식", "시세", "코스피", "코스닥", "나스닥", "상한가", "하한가",
            "종목", "현재가", "종가", "등락", "장마감", "장전", "시간외", "지수"
        )

        // Known major US stocks & index mappings
        private val US_STOCK_MAP = mapOf(
            "엔비디아" to "NVDA",
            "NVDA" to "NVDA",
            "애플" to "AAPL",
            "AAPL" to "AAPL",
            "테슬라" to "TSLA",
            "TSLA" to "TSLA",
            "마이크로소프트" to "MSFT",
            "MSFT" to "MSFT",
            "구글" to "GOOGL",
            "알파벳" to "GOOGL",
            "GOOGL" to "GOOGL",
            "GOOG" to "GOOG",
            "아마존" to "AMZN",
            "AMZN" to "AMZN",
            "메타" to "META",
            "META" to "META",
            "팔란티어" to "PLTR",
            "PLTR" to "PLTR",
            "AMD" to "AMD",
            "TSMC" to "TSM",
            "TSM" to "TSM",
            "나스닥" to "^IXIC",
            "NASDAQ" to "^IXIC",
            "다우" to "^DJI",
            "다우존스" to "^DJI",
            "DOW" to "^DJI",
            "S&P500" to "^GSPC",
            "에스앤피" to "^GSPC"
        )

        // Direct Korean major company quick map to avoid search latency
        private val KNOWN_KOREAN_STOCKS = mapOf(
            "삼성전자" to "005930",
            "SK하이닉스" to "000660",
            "에스케이하이닉스" to "000660",
            "LG에너지솔루션" to "373220",
            "현대차" to "005380",
            "현대자동차" to "005380",
            "기아" to "000270",
            "셀트리온" to "068270",
            "네이버" to "035420",
            "NAVER" to "035420",
            "카카오" to "035720",
            "삼성바이오로직스" to "207940",
            "POSCO홀딩스" to "005490",
            "포스코" to "005490",
            "포스코홀딩스" to "005490",
            "LG화학" to "051910",
            "삼성SDI" to "006400",
            "에코프로" to "086520",
            "에코프로비엠" to "247540",
            "알테오젠" to "196170",
            "카카오뱅크" to "323410",
            "크래프톤" to "259960",
            "하이브" to "352820",
            "두산에너빌리티" to "034020",
            "한화에어로스페이스" to "012450"
        )

        /**
         * Returns all known KOSPI, KOSDAQ, and major global ticker names for custom vocabulary biasing.
         */
        fun getAllKnownStockNames(): List<String> {
            return (KNOWN_KOREAN_STOCKS.keys + US_STOCK_MAP.keys + listOf("코스피", "코스닥", "나스닥", "KOSPI", "KOSDAQ", "다우", "S&P500")).distinct()
        }
    }

    /**
     * Inspects conversation text and keywords, identifying any stock or market index mention,
     * and fetches live market quotes.
     */
    suspend fun fetchQuotes(conversation: String, keywords: List<String>): List<KnowledgeItem> = withContext(Dispatchers.IO) {
        val results = mutableListOf<KnowledgeItem>()
        val seenCodes = mutableSetOf<String>()

        val trimmed = conversation.trim()
        val hasStockIntent = STOCK_TRIGGER_WORDS.any { trimmed.contains(it) }

        // 1. Check for Korean Market Indices (코스피, 코스닥)
        if (trimmed.contains("코스피", ignoreCase = true) || trimmed.contains("KOSPI", ignoreCase = true)) {
            fetchKoreanIndex("KOSPI", "코스피")?.let {
                results.add(it)
                seenCodes.add("KOSPI")
            }
        }
        if (trimmed.contains("코스닥", ignoreCase = true) || trimmed.contains("KOSDAQ", ignoreCase = true)) {
            fetchKoreanIndex("KOSDAQ", "코스닥")?.let {
                results.add(it)
                seenCodes.add("KOSDAQ")
            }
        }

        // 2. Check for US Stocks / Indices in conversation or keywords
        for ((nameOrTicker, symbol) in US_STOCK_MAP) {
            if (trimmed.contains(nameOrTicker, ignoreCase = true) || keywords.any { it.equals(nameOrTicker, ignoreCase = true) }) {
                if (!seenCodes.contains(symbol)) {
                    fetchUsQuote(symbol, nameOrTicker)?.let {
                        results.add(it)
                        seenCodes.add(symbol)
                    }
                }
            }
        }

        // 3. Check for 6-digit Korean stock codes
        val codeRegex = Regex("""\b\d{6}\b""")
        codeRegex.findAll(trimmed).forEach { match ->
            val code = match.value
            if (!seenCodes.contains(code)) {
                fetchKoreanStock(code)?.let {
                    results.add(it)
                    seenCodes.add(code)
                }
            }
        }

        // 4. Check for known Korean stock company names
        for ((companyName, code) in KNOWN_KOREAN_STOCKS) {
            if (trimmed.contains(companyName, ignoreCase = true) || keywords.any { it.equals(companyName, ignoreCase = true) }) {
                if (!seenCodes.contains(code)) {
                    fetchKoreanStock(code)?.let {
                        results.add(it)
                        seenCodes.add(code)
                    }
                }
            }
        }

        // 5. If stock trigger keyword is present (e.g. "주가", "시세", "주식"), attempt autocomplete on remaining keywords
        if (hasStockIntent && results.isEmpty()) {
            val candidateTokens = (keywords + trimmed.split(" "))
                .map { it.trim().replace(Regex("""[^a-zA-Z0-9가-힣]"""), "") }
                .filter { it.length in 2..10 && !STOCK_TRIGGER_WORDS.contains(it) }
                .distinct()

            for (token in candidateTokens.take(3)) {
                val resolvedCode = resolveNaverStockCode(token)
                if (resolvedCode != null && !seenCodes.contains(resolvedCode)) {
                    fetchKoreanStock(resolvedCode)?.let {
                        results.add(it)
                        seenCodes.add(resolvedCode)
                    }
                    if (results.size >= 2) break
                }
            }
        }

        results
    }

    /**
     * Quick test method to verify live price retrieval for any query (e.g. "삼성전자", "NVDA", "코스피").
     */
    suspend fun testQuote(query: String): Result<String> = withContext(Dispatchers.IO) {
        val trimmed = query.trim().ifBlank { "삼성전자" }

        try {
            // Check Korean index
            if (trimmed.equals("코스피", ignoreCase = true) || trimmed.equals("KOSPI", ignoreCase = true)) {
                val item = fetchKoreanIndex("KOSPI", "코스피")
                    ?: return@withContext Result.failure(Exception("코스피 지수 조회 실패"))
                return@withContext Result.success("${item.title} 실시간 시세: ${item.content.replace("\n", " ")}")
            }
            if (trimmed.equals("코스닥", ignoreCase = true) || trimmed.equals("KOSDAQ", ignoreCase = true)) {
                val item = fetchKoreanIndex("KOSDAQ", "코스닥")
                    ?: return@withContext Result.failure(Exception("코스닥 지수 조회 실패"))
                return@withContext Result.success("${item.title} 실시간 시세: ${item.content.replace("\n", " ")}")
            }

            // Check US stock
            val usSymbol = US_STOCK_MAP[trimmed] ?: if (trimmed.matches(Regex("""^[A-Z]{1,5}$"""))) trimmed.uppercase() else null
            if (usSymbol != null) {
                val item = fetchUsQuote(usSymbol, trimmed)
                if (item != null) {
                    return@withContext Result.success("${item.title}: ${item.content.replace("\n", " ")}")
                }
            }

            // Check 6-digit code
            if (trimmed.matches(Regex("""^\d{6}$"""))) {
                val item = fetchKoreanStock(trimmed)
                    ?: return@withContext Result.failure(Exception("종목코드($trimmed) 시세 조회 실패"))
                return@withContext Result.success("${item.title}: ${item.content.replace("\n", " ")}")
            }

            // Check known Korean stock
            val directCode = KNOWN_KOREAN_STOCKS[trimmed]
            if (directCode != null) {
                val item = fetchKoreanStock(directCode)
                    ?: return@withContext Result.failure(Exception("$trimmed 시세 조회 실패"))
                return@withContext Result.success("${item.title}: ${item.content.replace("\n", " ")}")
            }

            // Fallback to autocomplete lookup
            val resolvedCode = resolveNaverStockCode(trimmed)
            if (resolvedCode != null) {
                val item = fetchKoreanStock(resolvedCode)
                    ?: return@withContext Result.failure(Exception("검색된 종목($resolvedCode) 시세 조회 실패"))
                return@withContext Result.success("${item.title}: ${item.content.replace("\n", " ")}")
            }

            Result.failure(Exception("'$trimmed' 종목 또는 지수를 찾을 수 없습니다. 회사명, 6자리 종목코드, 또는 미국 티커를 입력해주세요."))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Resolves company name to 6-digit code via Naver Stock autocomplete API.
     */
    private fun resolveNaverStockCode(companyName: String): String? {
        var conn: HttpURLConnection? = null
        return try {
            val encoded = URLEncoder.encode(companyName, "UTF-8")
            val url = URL("https://ac.stock.naver.com/ac?q=$encoded&target=stock")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("User-Agent", USER_AGENT)
            }

            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                val items = json.optJSONArray("items")
                if (items != null && items.length() > 0) {
                    // Find exact match first, or take first stock
                    for (i in 0 until items.length()) {
                        val obj = items.getJSONObject(i)
                        val name = obj.optString("name", "")
                        val code = obj.optString("code", "")
                        if (name.equals(companyName, ignoreCase = true) && code.isNotBlank()) {
                            return code
                        }
                    }
                    items.getJSONObject(0).optString("code", "").ifBlank { null }
                } else null
            } else null
        } catch (e: Exception) {
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    /**
     * Fetches live quote for Korean stock code (e.g. "005930").
     */
    private fun fetchKoreanStock(stockCode: String): KnowledgeItem? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("https://m.stock.naver.com/api/stock/$stockCode/basic")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("User-Agent", USER_AGENT)
            }

            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)

                val stockName = json.optString("stockName", stockCode)
                val closePrice = json.optString("closePrice", "0")
                val comparePrice = json.optString("compareToPreviousClosePrice", "0")
                val ratio = json.optString("fluctuationsRatio", "0.0")

                val compareObj = json.optJSONObject("compareToPreviousPrice")
                val directionText = compareObj?.optString("text", "") ?: ""

                val marketStatus = json.optString("marketStatus", "CLOSE")
                val marketStatusKor = when (marketStatus.uppercase()) {
                    "OPEN" -> "장중"
                    "CLOSE" -> "장마감"
                    "PRE_MARKET" -> "장전"
                    "AFTER_MARKET" -> "장후"
                    else -> marketStatus
                }

                val exchange = json.optString("stockExchangeName", "KRX")

                val sign = if (!ratio.startsWith("-") && ratio != "0.0" && ratio != "0") "+" else ""
                val priceChangeStr = if (!comparePrice.startsWith("-") && comparePrice != "0") "+$comparePrice" else comparePrice

                val content = buildString {
                    append("- 📈 현재가: ${closePrice}원 (전일대비 ${priceChangeStr}원, $sign${ratio}% $directionText)")
                }

                KnowledgeItem(
                    sourceType = "STOCK",
                    title = "$stockName ($stockCode)",
                    senderOrSource = "네이버 증권",
                    content = content,
                    keywords = "$stockName, $stockCode, 주가, 시세",
                    timestamp = System.currentTimeMillis()
                )
            } else null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    /**
     * Fetches live index for KOSPI or KOSDAQ.
     */
    private fun fetchKoreanIndex(indexCode: String, indexName: String): KnowledgeItem? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("https://m.stock.naver.com/api/index/$indexCode/basic")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("User-Agent", USER_AGENT)
            }

            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)

                val name = json.optString("stockName", indexName)
                val closePrice = json.optString("closePrice", "0")
                val comparePrice = json.optString("compareToPreviousClosePrice", "0")
                val ratio = json.optString("fluctuationsRatio", "0.0")

                val compareObj = json.optJSONObject("compareToPreviousPrice")
                val directionText = compareObj?.optString("text", "") ?: ""

                val marketStatus = json.optString("marketStatus", "CLOSE")
                val marketStatusKor = when (marketStatus.uppercase()) {
                    "OPEN" -> "장중"
                    "CLOSE" -> "장마감"
                    else -> marketStatus
                }

                val sign = if (!ratio.startsWith("-") && ratio != "0.0" && ratio != "0") "+" else ""
                val priceChangeStr = if (!comparePrice.startsWith("-") && comparePrice != "0") "+$comparePrice" else comparePrice

                val content = buildString {
                    append("- 📈 현재 지수: $closePrice pt (전일대비 ${priceChangeStr} pt, $sign${ratio}% $directionText)")
                }

                KnowledgeItem(
                    sourceType = "STOCK",
                    title = "$name ($indexCode)",
                    senderOrSource = "네이버 증권",
                    content = content,
                    keywords = "$name, $indexCode, 지수, 시세",
                    timestamp = System.currentTimeMillis()
                )
            } else null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    /**
     * Fetches US stock quote or US market index from Yahoo Finance chart endpoint.
     */
    private fun fetchUsQuote(symbol: String, displayName: String): KnowledgeItem? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("https://query1.finance.yahoo.com/v8/finance/chart/$symbol?interval=1d&range=1d")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("User-Agent", USER_AGENT)
            }

            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                val chart = json.optJSONObject("chart") ?: return null
                val resultArr = chart.optJSONArray("result") ?: return null
                if (resultArr.length() == 0) return null

                val itemObj = resultArr.getJSONObject(0)
                val meta = itemObj.optJSONObject("meta") ?: return null

                val name = meta.optString("shortName", meta.optString("longName", displayName))
                val currency = meta.optString("currency", "USD")
                val currentPrice = meta.optDouble("regularMarketPrice", 0.0)
                val prevClose = meta.optDouble("chartPreviousClose", 0.0)

                val diff = currentPrice - prevClose
                val percent = if (prevClose > 0.0) (diff / prevClose) * 100.0 else meta.optDouble("regularMarketChangePercent", 0.0)

                val sign = if (diff >= 0) "+" else ""
                val priceFormatted = String.format(Locale.US, "%.2f", currentPrice)
                val diffFormatted = String.format(Locale.US, "%.2f", diff)
                val percentFormatted = String.format(Locale.US, "%.2f", percent)

                val content = buildString {
                    append("- 📈 현재가: $priceFormatted $currency (전일대비 $sign$diffFormatted $currency, $sign$percentFormatted%)")
                }

                KnowledgeItem(
                    sourceType = "STOCK",
                    title = "$name ($symbol)",
                    senderOrSource = "Yahoo Finance",
                    content = content,
                    keywords = "$name, $symbol, 미국주식, 시세",
                    timestamp = System.currentTimeMillis()
                )
            } else null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }
}
