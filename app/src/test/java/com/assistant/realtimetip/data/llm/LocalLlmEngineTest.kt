package com.assistant.realtimetip.data.llm

import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalLlmEngineTest {

    @Test
    fun testPromptContainsExactSystemInstruction() {
        val requiredSystemInstruction = "너는 사용자의 대화를 듣고 사전 수집된 [이메일]과 [최신 뉴스]를 근거로 즉각적인 팁을 주는 비서다. 대화와 직접 연관된 근거가 있을 때만 답변하고 없으면 'NONE'만 출력하라. 반드시 불릿 기호(-)를 사용해 최대 3줄 이내(1~3줄)로 핵심 액션 팁만 간결하게 요약하고, 각 팁 끝에 출처(발신자/일자 또는 언론사/일자)를 괄호로 표기하라. 3줄을 초과하여 출력하지 마라."

        val sampleEvidence = listOf(
            KnowledgeItem(
                id = 1,
                sourceType = "EMAIL",
                title = "쿠버네티스 1.30 업그레이드 일정",
                senderOrSource = "devops@company.com",
                content = "다음 주 화요일 클러스터 점검이 예정되어 있습니다.",
                keywords = "쿠버네티스, 점검, 업그레이드"
            )
        )

        val conversation = "우리 쿠버네티스 배포 언제 점검이지?"

        val sb = StringBuilder()
        sb.append(requiredSystemInstruction).append("\n\n")
        sb.append("[사전 수집된 근거 자료]:\n")
        sampleEvidence.forEachIndexed { index, item ->
            val typeTag = if (item.sourceType == "EMAIL") "[이메일]" else "[최신 뉴스]"
            sb.append("${index + 1}. $typeTag 제목: ${item.title} (출처: ${item.senderOrSource})\n")
            sb.append("   내용: ${item.content}\n")
        }
        sb.append("\n[사용자 실시간 대화 내용]:\n\"$conversation\"\n\n[답변]:\n")

        val prompt = sb.toString()

        assertTrue(prompt.contains(requiredSystemInstruction))
        assertTrue(prompt.contains("[이메일] 제목: 쿠버네티스 1.30 업그레이드 일정"))
        assertTrue(prompt.contains("devops@company.com"))
        assertTrue(prompt.contains(conversation))
    }

    @Test
    fun testModelScannerDefaultPath() {
        assertEqualsGgufName(ModelFileManager.DEFAULT_MODEL_NAME)
    }

    private fun assertEqualsGgufName(name: String) {
        assertTrue(name.endsWith(".gguf"))
        assertTrue(name.contains("EXAONE"))
    }
}
