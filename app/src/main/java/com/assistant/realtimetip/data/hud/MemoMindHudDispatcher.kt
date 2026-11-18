package com.assistant.realtimetip.data.hud

import android.content.Context
import android.content.Intent
import com.assistant.realtimetip.data.local.entity.TipHistory
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Dispatches 1-3 line HUD formatted payloads to MemoMind One smart glasses companion listeners
 * and real-time internal UI flows.
 */
class MemoMindHudDispatcher(
    private val context: Context
) {

    private val _hudPayloadFlow = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 64)
    val hudPayloadFlow: SharedFlow<String> = _hudPayloadFlow.asSharedFlow()

    // Adaptive FPS & Heartbeat: dirty-check and 4-second keepalive sync
    private var lastDispatchedPayload: String = ""
    private var lastDispatchTimestamp: Long = 0L

    companion object {
        const val ACTION_DISPLAY_TIP = "com.memomind.hud.ACTION_DISPLAY_TIP"
        const val EXTRA_TIP_TEXT = "tip_text"
        const val EXTRA_CAPTION_TEXT = "caption_text"
        const val EXTRA_SOURCE_TYPE = "source_type"
        const val EXTRA_DURATION_MS = "duration_ms"
        const val DEFAULT_DISPLAY_DURATION_MS = 3000L
        const val HEARTBEAT_INTERVAL_MS = 4000L // 4s heartbeat to prevent smart glass freeze
    }

    /**
     * Dispatches HUD formatted payload with Adaptive FPS (0 FPS when static, 1 FPS heartbeat).
     */
    fun dispatchTip(tip: TipHistory, captionText: String = "") {
        val formattedPayload = formatForHud(tip.generatedTip)
        val now = System.currentTimeMillis()

        // Adaptive FPS: If payload and caption are identical and within heartbeat interval, suppress transmission
        val fullSignature = "${tip.id}::$formattedPayload::$captionText"
        val isDirty = fullSignature != lastDispatchedPayload
        val isHeartbeatDue = (now - lastDispatchTimestamp) >= HEARTBEAT_INTERVAL_MS

        if (!isDirty && !isHeartbeatDue) {
            return
        }

        lastDispatchedPayload = fullSignature
        lastDispatchTimestamp = now

        // 1. Emit to SharedFlow for real-time in-app companion observers
        _hudPayloadFlow.tryEmit(formattedPayload)

        // 2. Broadcast Android Intent for external MemoMind One companion bridges
        val intent = Intent(ACTION_DISPLAY_TIP).apply {
            putExtra(EXTRA_TIP_TEXT, formattedPayload)
            putExtra(EXTRA_CAPTION_TEXT, captionText.trim())
            putExtra(EXTRA_SOURCE_TYPE, tip.sourceType)
            putExtra(EXTRA_DURATION_MS, DEFAULT_DISPLAY_DURATION_MS)
        }
        try {
            context.sendBroadcast(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun dispatchStandby() {
        val standbyText = "[ MEMOMIND HUD READY ]"
        _hudPayloadFlow.tryEmit(standbyText)
    }

    /**
     * Formats raw generated tip for MemoMind One optical waveguide display:
     * - Strips URLs and markdown links
     * - Strips boilerplate filler phrases
     * - Converts status/directions to crisp HUD icons (▲, ▼, ▶, 🕒, ⚠, ★)
     * - Normalizes bullet prefix '-'
     * - Strictly limits to max 3 lines
     * - Safely wraps / truncates line length to ~38 characters
     */
    fun formatForHud(rawTip: String): String {
        val clean = rawTip
            .replace(Regex("""\[([^\]]+)\]\([^\)]+\)"""), "$1")
            .replace(Regex("""https?://\S+"""), "")
            .replace(Regex("""(?i)\b(Re|RE|Fwd|FW|\[회신\]|\[전달\]|\[FWD\])[:\s\-]+"""), "")
            .replace(Regex("""\s*\([^\)]*(?:출처|일자|증권|Finance|\d{4}\.\d{2}\.\d{2})[^\)]*\)"""), "")
            .replace("관련 정보를 확인하세요.", "")
            .replace("관련 정보를 확인하세요", "")
            .replace("자세한 내용은 링크를 참고하세요.", "")
            .replace("자세한 내용은 링크를 참고하세요", "")
            .replace("세부 사항을 확인하세요.", "")
            .replace("세부 사항을 확인하세요", "")
            .replace("도움이 되길 바랍니다.", "")
            .replace("도움이 되길 바랍니다", "")
            .replace("참고하시기 바랍니다.", "")
            .replace("참고하시기 바랍니다", "")
            .replace("확인해 보세요.", "")
            .replace("확인해 보세요", "")
            .replace("확인하시기 바랍니다.", "")
            .replace("확인하시기 바랍니다", "")
            .replace("확인바랍니다.", "")
            .replace("확인바랍니다", "")
            .replace("참고바랍니다.", "")
            .replace("참고바랍니다", "")
            // Remove Contact boilerplate & text label
            .replace(Regex("""휴대전화\s*[:\s]*"""), "")
            .replace(Regex("""휴대 전화\s*[:\s]*"""), "")
            .replace("최근 상태:", "최근 통화 내용:")
            .replace("최근 상태", "최근 통화 내용")
            // Convert status to HUD icons
            .replace("상승", "▲")
            .replace("오름", "▲")
            .replace("하락", "▼")
            .replace("내림", "▼")
            .replace("보합", "▶")
            .replace("주의", "⚠")
            .replace("경고", "⚠")
            .replace("핵심", "★")
            .replace("포인트", "★")
            .replace("캘린더", "📅")
            .replace("스케줄", "📅")
            .replace("일정", "📅")
            .replace("통화", "📞")
            .replace("전화", "📞")
            .replace(Regex("""(👤\s*[:\s]*)+"""), "👤 ")
            .replace(Regex("""(📞\s*[:\s]*)+"""), "📞 ")
            .replace(Regex("""(📅\s*[:\s]*)+"""), "📅 ")
            .replace(Regex("""(★\s*[:\s]*)+"""), "★ ")
            .replace(Regex("""(▲\s*)+"""), "▲ ")
            .replace(Regex("""(▼\s*)+"""), "▼ ")
            .replace(Regex("""(▶\s*)+"""), "▶ ")
            .replace(Regex("""(⚠\s*)+"""), "⚠ ")
            // Remove bold/italic markdown markers
            .replace("**", "")
            .replace("*", "")
            .replace("`", "")
            .trim()

        val lines = clean.lines()
            .map { it.trim() }
            .filter { line ->
                val l = line.removePrefix("-").trim()
                l.isNotBlank() && l != "-" &&
                !l.contains("실시간 음성대화중") && !l.contains("실시간 음성 대화중") &&
                !l.contains("필요한 정보를 자동으로") &&
                !l.contains("AI 추천") && !l.contains("AI추천") &&
                !l.contains("시장 현황") && !l.contains("시장현황") &&
                !l.contains("투자동향") && !l.contains("투자 동향") &&
                !l.contains("출처 및 기준") && !l.contains("AI 투자 조언") &&
                !l.contains("세부내용") && !l.contains("세부 내용") &&
                !l.contains("연관 시사점") && !l.contains("연관시사점") &&
                !l.contains("연관키워드") && !l.contains("연관 키워드")
            }

        val hudLines = lines.take(8).map { line ->
            if (line.startsWith("-")) line else "- $line"
        }

        return hudLines.joinToString("\n").ifBlank { "[ 대기 중 ]" }
    }

    /**
     * Formats a complete, dedicated 5~8 line HUD payload for MemoMind One waveguide display (560x320),
     * strictly derived ONLY from this specific active tip, preventing any cross-tip line pollution.
     */
    fun formatFullHudLines(tip: TipHistory): List<String> {
        val resultLines = mutableListOf<String>()

        val rawGenerated = formatForHud(tip.generatedTip).lines()
            .map { it.trim().removePrefix("-").trim() }
            .filter { it.isNotBlank() && it != "[ 대기 중 ]" }

        val rawReference = formatForHud(tip.referenceContent).lines()
            .map { it.trim().removePrefix("-").trim() }
            .filter { it.isNotBlank() && it != "[ 대기 중 ]" }

        // 1. Ingest generated tip lines
        rawGenerated.forEach { line ->
            if (resultLines.none { it.contains(line.take(15)) }) {
                resultLines.add(line)
            }
        }

        // 2. If fewer than 5 lines, supplement from referenceContent
        if (resultLines.size < 5) {
            rawReference.forEach { refLine ->
                if (resultLines.none { it.contains(refLine.take(15)) }) {
                    resultLines.add(refLine)
                }
            }
        }

        // 3. Clean up icons and prefixes with Strict Anti-Duplicate Icon Rule
        val cleaned = resultLines.map { line ->
            var l = line
                .replace(Regex("""(👤\s*[:\s]*)+"""), "👤 ")
                .replace(Regex("""(📞\s*[:\s]*)+"""), "📞 ")
                .replace(Regex("""(📅\s*[:\s]*)+"""), "📅 ")
                .replace(Regex("""(★\s*[:\s]*)+"""), "★ ")
                .replace(Regex("""(▲\s*)+"""), "▲ ")
                .replace(Regex("""(▼\s*)+"""), "▼ ")
                .replace(Regex("""(▶\s*)+"""), "▶ ")
                .replace(Regex("""(⚠\s*)+"""), "⚠ ")
                .trim()

            // Remove internal duplicate icons within the line
            l = l.replace(Regex("""(📞)\s+.*?\s+(📞)"""), "$1 ")
                .replace(Regex("""(👤)\s+.*?\s+(👤)"""), "$1 ")

            if (!l.startsWith("-") && !l.startsWith("•") && !l.startsWith("★") && !l.startsWith("💡") && !l.startsWith("📌") && !l.startsWith("👤") && !l.startsWith("📞") && !l.startsWith("📅") && !l.startsWith("📈") && !l.startsWith("📧") && !l.startsWith("📰") && !l.startsWith("🔍")) {
                "• $l"
            } else {
                l
            }
        }.filter { it.isNotBlank() }

        // 4. Specialized formatting per sourceType to strictly exclude boilerplate
        val finalLines = cleaned.toMutableList()
        val filtered = when (tip.sourceType.uppercase()) {
            "CONTACTS" -> {
                // Ultra-Minimal Contact Tips: display ONLY the contact's Name and Phone Number
                // Strictly remove company names, departments, recent call summaries, and all other metadata
                val nameLine = finalLines.firstOrNull { it.contains("👤") || !it.contains("010") }
                    ?.replace(Regex("""(📞\s*.*)"""), "")
                    ?.trim()
                val phoneLine = finalLines.firstOrNull { it.contains("010") || it.contains("전화") || it.contains("📞") }
                    ?.let { raw ->
                        val digits = raw.filter { it.isDigit() || it == '-' }
                        if (digits.isNotBlank()) "📞 $digits" else raw
                    }

                listOfNotNull(
                    nameLine?.let { if (!it.startsWith("👤")) "👤 ${it.removePrefix("•").trim()}" else it },
                    phoneLine?.let { if (!it.startsWith("📞")) "📞 ${it.removePrefix("•").trim()}" else it }
                ).take(2)
            }
            "STOCK" -> {
                // Keep only essential stock price / ticker summary
                finalLines.filter { line ->
                    !line.contains("시장 현황") && !line.contains("투자동향") &&
                    !line.contains("투자 동향") && !line.contains("출처 및 기준") &&
                    !line.contains("AI 투자 조언") && !line.contains("필요한 정보")
                }.take(2)
            }
            "WEB" -> {
                // Remove: 세부내용, 연관 시사점, 연관키워드
                finalLines.filter { line ->
                    !line.contains("세부내용") && !line.contains("세부 내용") &&
                    !line.contains("연관 시사점") && !line.contains("연관시사점") &&
                    !line.contains("연관키워드") && !line.contains("연관 키워드") &&
                    !line.contains("필요한 정보")
                }.take(5)
            }
            else -> {
                // Remove generic boilerplate and keep up to 6-7 core content lines to fill display without empty gaps
                finalLines.filter { line ->
                    !line.contains("AI 추천") && !line.contains("AI 조언") &&
                    !line.contains("AI 팁") && !line.contains("필요한 정보")
                }.take(7)
            }
        }

        return filtered.ifEmpty { listOf(tip.generatedTip.lines().firstOrNull()?.trim() ?: "[ 대기 중 ]") }
    }
}
