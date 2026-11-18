package com.assistant.realtimetip.data.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextSummarizerTest {

    @Test
    fun testEmailSummarizationCappedAtThreeLines() {
        val rawEmail = """
            안녕하세요 김 개발자님,
            수고 많으십니다.
            다음 주 화요일 오전 10시에 클러스터 정기 점검이 진행될 예정입니다.
            점검 중에는 서비스 배포가 일시적으로 중단되오니 사전 확인을 부탁드립니다.
            문제가 발생하면 인프라 팀으로 즉시 연락해 주시기 바랍니다.
            추가로 백업 로그도 함께 점검 부탁드립니다.
            감사합니다. 좋은 하루 되세요.
            보낸사람: 인프라팀 <infra@company.com>
        """.trimIndent()

        val summary = TextSummarizer.summarizeEmail(rawEmail, "정기 점검 안내")
        val lines = summary.lines().filter { it.isNotBlank() }

        // Must be at most 3 lines
        assertTrue("Summary lines must be <= 3 (was ${lines.size})", lines.size in 1..3)
        // Must filter out noise lines
        assertFalse(summary.contains("안녕하세요"))
        assertFalse(summary.contains("감사합니다"))
        assertFalse(summary.contains("보낸사람:"))
        // Must contain core content
        assertTrue(summary.contains("클러스터 정기 점검"))
    }

    @Test
    fun testNewsSummarizationCappedAtThreeLines() {
        val rawNews = """
            (서울=뉴스) 정부가 수능 시험장 내 모든 스마트기기 반납을 추진합니다.
            공공 와이파이 차단 조치도 병행될 방침입니다.
            교육부는 부정행위 방지를 위해 철저히 대응하겠다고 밝혔습니다.
            이와 관련된 세부 지침은 내일 발표됩니다.
            ⓒ 뉴스 무단전재 및 재배포 금지
        """.trimIndent()

        val summary = TextSummarizer.summarizeNews(rawNews, "수능 스마트기기 반납")
        val lines = summary.lines().filter { it.isNotBlank() }

        assertTrue("News summary lines must be <= 3 (was ${lines.size})", lines.size in 1..3)
        assertFalse(summary.contains("무단전재"))
        assertTrue(summary.contains("스마트기기 반납"))
    }
}
