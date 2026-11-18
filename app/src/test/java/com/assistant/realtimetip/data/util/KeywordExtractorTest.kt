package com.assistant.realtimetip.data.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KeywordExtractorTest {

    @Test
    fun testKoreanParticleStrippingAndStopwords() {
        val emailBody = """
            쿠버네티스에서는 파드 배포가 매우 중요합니다. 
            스프링부트로 작성된 백엔드 서버는 도커 컨테이너를 통해 AWS 클라우드에 배포됩니다.
            하지만 데이터베이스 연결 설정에 대해서는 다시 한번 확인을 부탁드립니다.
        """.trimIndent()

        val keywords = KeywordExtractor.extractKeywordList(emailBody, maxKeywords = 10)

        // Verifies Korean Josa stripping (e.g. 쿠버네티스에서는 -> 쿠버네티스, 스프링부트로 -> 스프링부트)
        assertTrue("Should contain 쿠버네티스", keywords.contains("쿠버네티스"))
        assertTrue("Should contain 스프링부트", keywords.contains("스프링부트"))
        assertTrue("Should contain 배포", keywords.contains("배포"))
        assertTrue("Should contain 도커", keywords.contains("도커"))
        assertTrue("Should contain 컨테이너", keywords.contains("컨테이너"))

        // Verifies stopword removal
        assertFalse("Should not contain 하지만", keywords.contains("하지만"))
        assertFalse("Should not contain 대해서는", keywords.contains("대해서는"))
        assertFalse("Should not contain 부탁드립니다", keywords.contains("부탁드립니다"))
    }
}
