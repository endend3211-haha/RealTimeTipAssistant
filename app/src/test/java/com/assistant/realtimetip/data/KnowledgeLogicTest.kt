package com.assistant.realtimetip.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit test verifying keyword formatting, biasing deduplication, and FTS sanitization.
 */
class KnowledgeLogicTest {

    @Test
    fun testBiasingKeywordsExtraction() {
        val sampleKeywordRows = listOf(
            "스프링, 배포, 쿠버네티스",
            "쿠버네티스, 도커, MSA",
            "스프링, 클라우드, AWS"
        )

        val extracted = sampleKeywordRows
            .flatMap { it.split(",") }
            .map { it.trim() }
            .filter { it.length >= 2 }
            .distinct()
            .take(50)

        assertEquals(6, extracted.size)
        assertTrue(extracted.contains("스프링"))
        assertTrue(extracted.contains("배포"))
        assertTrue(extracted.contains("쿠버네티스"))
        assertTrue(extracted.contains("도커"))
        assertTrue(extracted.contains("MSA"))
        assertTrue(extracted.contains("클라우드"))
    }

    @Test
    fun testFtsQueryConstruction() {
        val keywords = listOf("스프링", "쿠버네티스", "AWS 배포")
        val cleanKeywords = keywords
            .map { it.trim().replace("\"", "").replace("'", "") }
            .filter { it.isNotBlank() }

        val ftsQuery = cleanKeywords.joinToString(" OR ") { "\"$it\"*" }
        assertEquals("\"스프링\"* OR \"쿠버네티스\"* OR \"AWS 배포\"*", ftsQuery)
    }
}
