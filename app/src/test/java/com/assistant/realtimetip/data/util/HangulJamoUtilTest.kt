package com.assistant.realtimetip.data.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HangulJamoUtilTest {

    @Test
    fun testHangulDecomposition() {
        val decomposed = HangulJamoUtil.decompose("쿠버네티스")
        // ㅋ(1) ㅜ(1) ㅂ(1) ㅓ(1) ㄴ(1) ㅔ(1) ㅌ(1) ㅣ(1) ㅅ(1) ㅡ(1) = 10 Jamo chars
        assertEquals("ㅋㅜㅂㅓㄴㅔㅌㅣㅅㅡ", decomposed)

        val decomposedSpring = HangulJamoUtil.decompose("스프링")
        // ㅅ ㅡ ㅍ ㅡ ㄹ ㅣ ㅇ
        assertEquals("ㅅㅡㅍㅡㄹㅣㅇ", decomposedSpring)
    }

    @Test
    fun testPhoneticSimilarity() {
        // High similarity for minor phonetic variations
        val similarity1 = HangulJamoUtil.computeJamoSimilarity("쿠베네티스", "쿠버네티스")
        assertTrue("Similarity should be >= 0.85 (was $similarity1)", similarity1 >= 0.85f)

        val similarity2 = HangulJamoUtil.computeJamoSimilarity("구버네티스", "쿠버네티스")
        assertTrue("Similarity should be >= 0.85 (was $similarity2)", similarity2 >= 0.85f)

        // Exact match should be 1.0
        val exactSim = HangulJamoUtil.computeJamoSimilarity("도커 배포", "도커 배포")
        assertEquals(1.0f, exactSim, 0.001f)

        // Completely different words should have low similarity
        val lowSim = HangulJamoUtil.computeJamoSimilarity("사과", "쿠버네티스")
        assertTrue("Similarity should be < 0.40 (was $lowSim)", lowSim < 0.40f)
    }
}
