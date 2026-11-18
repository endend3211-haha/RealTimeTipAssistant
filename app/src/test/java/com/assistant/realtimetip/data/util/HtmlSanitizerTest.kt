package com.assistant.realtimetip.data.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HtmlSanitizerTest {

    @Test
    fun testStripHtmlWithScriptsAndStyles() {
        val rawHtml = """
            <html>
                <head>
                    <style>body { color: red; }</style>
                    <script>alert("hello world");</script>
                </head>
                <body>
                    <h2>프로젝트 배포 일정 안내</h2>
                    <p>안녕하세요,<br/>이번 <b>쿠버네티스</b> 클러스터 정기 점검은 <strong>오후 3시</strong>입니다.</p>
                    <div>참조: &lt;dev-team@company.com&gt; &amp; &quot;운영팀&quot;</div>
                </body>
            </html>
        """.trimIndent()

        val cleanText = HtmlSanitizer.stripHtml(rawHtml)

        assertFalse(cleanText.contains("color: red"))
        assertFalse(cleanText.contains("alert"))
        assertFalse(cleanText.contains("<"))
        assertFalse(cleanText.contains(">"))
        assertTrue(cleanText.contains("프로젝트 배포 일정 안내"))
        assertTrue(cleanText.contains("쿠버네티스 클러스터 정기 점검"))
        assertTrue(cleanText.contains("<dev-team@company.com> & \"운영팀\""))
    }
}
