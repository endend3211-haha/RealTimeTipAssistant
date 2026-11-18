package com.assistant.realtimetip.data.util

/**
 * Utility for producing concise 1~3 line summaries from emails and news articles,
 * allowing immediate discarding of verbose raw text bodies for storage optimization.
 */
object TextSummarizer {

    // Common email greetings, closures, and boilerplate prefixes to filter out
    private val EMAIL_NOISE_PATTERNS = listOf(
        Regex("^(안녕하세요|반갑습니다|안녕|수고하십니다|수고 많으십니다|안녕하십니까)[,.~! ]*"),
        Regex("^(감사합니다|고맙습니다|좋은 하루 되세요|행복한 하루 되세요|즐거운 주말 되세요)[,.~! ]*"),
        Regex("^(보낸사람|받는사람|참조|제목|날짜|발신|수신|전송일자|From|To|Date|Subject|Cc|Sent):.*", RegexOption.IGNORE_CASE),
        Regex(".*(무단전재 및 재배포 금지|저작권자|기자|ⓒ|All rights reserved).*", RegexOption.IGNORE_CASE),
        Regex(".*(본 메일은 발신전용|수신을 원치 않으시면|수신거부|뉴스레터 구독).*", RegexOption.IGNORE_CASE)
    )

    /**
     * Extracts a concise 1~3 line summary from raw email text and immediately discards the rest.
     * Guaranteed to return at most 3 concise bullet lines.
     */
    fun summarizeEmail(rawText: String?, fallbackSubject: String = ""): String {
        if (rawText.isNullOrBlank()) {
            return if (fallbackSubject.isNotBlank()) "- $fallbackSubject" else "- (본문 내용 없음)"
        }

        val cleanText = HtmlSanitizer.stripHtml(rawText)
        val rawLines = cleanText.split("\n", ".", "?", "!")
            .map { it.trim() }
            .filter { line ->
                line.length >= 8 &&
                !isNoiseLine(line)
            }

        val selectedLines = if (rawLines.isEmpty()) {
            listOf(fallbackSubject.ifBlank { cleanText.take(100) })
        } else {
            // Pick up to 3 core informative sentences
            rawLines.distinct().take(3)
        }

        return selectedLines
            .take(3)
            .joinToString("\n") { line ->
                val trimmed = line.take(120).trim()
                if (trimmed.startsWith("-")) trimmed else "- $trimmed"
            }
    }

    /**
     * Extracts a concise 1~3 line summary from news RSS description and title.
     * Guaranteed to return at most 3 concise bullet lines.
     */
    fun summarizeNews(description: String?, title: String = ""): String {
        val cleanText = HtmlSanitizer.stripHtml(description)
        val candidate = if (cleanText.isNotBlank()) cleanText else title

        val sentences = candidate.split("\n", ".", "?", "!")
            .map { it.trim() }
            .filter { it.length >= 8 && !isNoiseLine(it) }

        val selected = if (sentences.isEmpty()) {
            listOf(title.take(120))
        } else {
            sentences.distinct().take(3)
        }

        return selected
            .take(3)
            .joinToString("\n") { line ->
                val trimmed = line.take(120).trim()
                if (trimmed.startsWith("-")) trimmed else "- $trimmed"
            }
    }

    private fun isNoiseLine(line: String): Boolean {
        for (pattern in EMAIL_NOISE_PATTERNS) {
            if (pattern.containsMatchIn(line)) return true
        }
        return false
    }
}
