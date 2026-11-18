package com.assistant.realtimetip.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.assistant.realtimetip.data.local.entity.TipHistory
import com.assistant.realtimetip.data.pipeline.HudFeedLine
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val HudPitchBlack = Color(0xFF000000)
private val HudPhosphorGreen = Color(0xFF00FF66)
private val HudDimGreen = Color(0xFF007A33)
private val HudDividerGreen = Color(0xFF004D20)
private val HudFaintGreen = Color(0xFF00FF66).copy(alpha = 0.15f)

/**
 * MemoMind One Smart Glasses Optical Waveguide HUD Preview Viewport (560 × 320 Standard).
 * - Continuous Line-by-Line Teleprompter Roll-Up Feed
 * - Dynamic Metadata Header Bar (Source/Sender/Date)
 * - 100% Full Optical Utilization (Eliminating the empty space)
 * - Clean Bottom Live Caption Bar ('💬 실시간 대화 자막', instant streaming)
 */
@Composable
fun MemoMindHudCard(
    hudFeedLines: List<HudFeedLine>,
    activeTip: TipHistory?,
    queuedTipCount: Int,
    hudProgress: Float, // 1.0f down to 0.0f over 1 second per line
    liveCaption: String,
    onTipClick: (TipHistory) -> Unit,
    modifier: Modifier = Modifier
) {
    val hudShape = RoundedCornerShape(12.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(560f / 320f)
            .clip(hudShape)
            .background(HudPitchBlack)
            .border(1.dp, HudPhosphorGreen.copy(alpha = 0.35f), hudShape)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 8.dp)
        ) {
            if (activeTip != null) {
                // ==================== MODE A: DUAL-PANE (AI TIP + LIVE CAPTION) ====================
                // --- Zone 1: Main AI Tip Display Zone (Upper ~62%) ---
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(0.62f),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    // 1.1 Dynamic Metadata Top Header Bar (11.5sp compact native scale)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val headerTag = formatHudMetadataHeader(activeTip)
                        Text(
                            text = headerTag,
                            color = HudPhosphorGreen,
                            fontSize = 11.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Clip
                        )

                        val queueText = if (queuedTipCount > 0) "Q: +$queuedTipCount (1s)" else "LIVE 1s"
                        Text(
                            text = queueText,
                            color = if (queuedTipCount > 0) HudPhosphorGreen else HudPhosphorGreen.copy(alpha = 0.65f),
                            fontSize = 10.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // 1.2 Teleprompter Tip Content (Glanceable 4-5 lines to fill display without empty gaps)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .padding(top = 2.dp, bottom = 2.dp),
                        verticalArrangement = if (hudFeedLines.size <= 2) Arrangement.Center else Arrangement.Top
                    ) {
                        val displayLines = if (hudFeedLines.size <= 5) hudFeedLines else hudFeedLines.takeLast(5)
                        val activeFontSize = if (displayLines.size <= 2) 13.5.sp else if (displayLines.size <= 3) 12.5.sp else 11.5.sp
                        val activeLineHeight = if (displayLines.size <= 2) 18.sp else if (displayLines.size <= 3) 16.5.sp else 15.sp

                        displayLines.forEach { feedLine ->
                            val isLineActive = feedLine.isActive
                            val lineFontSize = if (isLineActive) activeFontSize else 11.sp
                            val lineLineHeight = if (isLineActive) activeLineHeight else 14.sp
                            val lineAlpha = if (isLineActive) 1.0f else 0.55f
                            val lineColor = if (isLineActive) HudPhosphorGreen else HudDimGreen

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .alpha(lineAlpha)
                                    .clickable { onTipClick(activeTip) }
                                    .padding(vertical = if (displayLines.size <= 2) 2.dp else 0.5.dp)
                            ) {
                                val rawClean = feedLine.text.trim().removePrefix("-").trim()
                                val hasIconOrBullet = rawClean.startsWith("•") || rawClean.startsWith("★") ||
                                        rawClean.startsWith("👤") || rawClean.startsWith("📞") ||
                                        rawClean.startsWith("📅") || rawClean.startsWith("📈") ||
                                        rawClean.startsWith("📧") || rawClean.startsWith("📰") ||
                                        rawClean.startsWith("💡") || rawClean.startsWith("🔍") ||
                                        rawClean.startsWith("📌")
                                val prefix = if (!isLineActive) "▲ " else if (hasIconOrBullet) "" else "• "
                                Text(
                                    text = "$prefix$rawClean",
                                    color = lineColor,
                                    fontSize = lineFontSize,
                                    lineHeight = lineLineHeight,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = if (isLineActive) FontWeight.Bold else FontWeight.Normal,
                                    maxLines = 2,
                                    softWrap = true,
                                    overflow = TextOverflow.Clip
                                )
                            }
                        }
                    }

                    // 1.3 1-Second Countdown Progress Bar
                    if (hudFeedLines.isNotEmpty()) {
                        LinearProgressIndicator(
                            progress = { hudProgress },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(2.dp)
                                .clip(RoundedCornerShape(1.dp)),
                            color = HudPhosphorGreen,
                            trackColor = HudFaintGreen
                        )
                    }
                }

                // --- Divider between Tip Zone and Live Caption Zone ---
                HorizontalDivider(
                    thickness = 1.dp,
                    color = HudDividerGreen,
                    modifier = Modifier.padding(vertical = 2.dp)
                )

                // --- Zone 2: Dedicated Live Speech Caption Zone (Lower ~38% - Fully Utilizing the Empty Space!) ---
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(0.38f),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "💬 실시간 대화 자막",
                            color = HudPhosphorGreen,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "● 실시간 청취",
                            color = HudPhosphorGreen.copy(alpha = 0.75f),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    val captionDisplay = liveCaption.ifBlank { "음성을 감지하면 실시간 자막과 AI 분석이 여기에 동시 표시됩니다." }
                    val isStreaming = liveCaption.isNotBlank()
                    Text(
                        text = captionDisplay,
                        color = if (isStreaming) HudPhosphorGreen else HudDimGreen,
                        fontSize = 11.5.sp,
                        lineHeight = 15.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 3,
                        softWrap = true,
                        overflow = TextOverflow.Clip,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 1.dp)
                    )
                }
            } else {
                // ==================== MODE B: FULL-SCREEN CONVERSATION CAPTIONS ====================
                // When no tip is active: 100% of the screen is used for large, continuous conversation transcript!
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "[실시간 대화 자막] 온디바이스 음성 인식",
                            color = HudPhosphorGreen,
                            fontSize = 11.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "● 청취 중 (LIVE)",
                            color = HudPhosphorGreen,
                            fontSize = 10.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    HorizontalDivider(
                        thickness = 1.dp,
                        color = HudDividerGreen,
                        modifier = Modifier.padding(vertical = 3.dp)
                    )

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        verticalArrangement = Arrangement.Center
                    ) {
                        val captionDisplay = liveCaption.ifBlank { "음성을 감지하면 실시간 자막과 AI 분석 팁이 여기에 표시됩니다" }
                        val isStreaming = liveCaption.isNotBlank()
                        Text(
                            text = captionDisplay,
                            color = if (isStreaming) HudPhosphorGreen else HudPhosphorGreen.copy(alpha = 0.65f),
                            fontSize = if (isStreaming) 15.sp else 13.5.sp,
                            lineHeight = if (isStreaming) 21.sp else 19.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = if (isStreaming) FontWeight.Bold else FontWeight.Normal,
                            softWrap = true,
                            maxLines = 6,
                            overflow = TextOverflow.Clip
                        )
                    }

                    HorizontalDivider(
                        thickness = 1.dp,
                        color = HudDividerGreen,
                        modifier = Modifier.padding(vertical = 2.dp)
                    )

                    Text(
                        text = "💡 대화 중 필요한 지식(연락처/주식/일정/이메일 등)이 자동으로 분석됩니다",
                        color = HudDimGreen,
                        fontSize = 10.5.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 1,
                        overflow = TextOverflow.Clip
                    )
                }
            }
        }
    }
}

/**
 * Formats top HUD metadata bar dynamically with source name, sender/publisher, and date/time.
 */
private fun formatHudMetadataHeader(tip: TipHistory?): String {
    if (tip == null) return "[대기 중] 대화 감지 대기"

    val timeStr = SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(tip.timestamp))
    val dateStr = SimpleDateFormat("M/d", Locale.KOREA).format(Date(tip.timestamp))

    val (senderOrSource, titlePart) = if (tip.referenceTitle.contains("|")) {
        val s = tip.referenceTitle.substringBefore("|").trim()
        val t = tip.referenceTitle.substringAfter("|").trim()
        s to t
    } else {
        tip.referenceTitle.trim() to ""
    }

    return when (tip.sourceType.uppercase()) {
        "WEB" -> {
            val src = senderOrSource.ifBlank { "인터넷" }
            "[웹 검색] $src · $dateStr"
        }
        "EMAIL" -> {
            val cleanSender = senderOrSource
                .substringBefore("<")
                .trim()
                .ifBlank { senderOrSource.substringBefore("@") }
                .ifBlank { "발신자" }
            "[이메일] $cleanSender · $timeStr"
        }
        "STOCK" -> {
            val market = if (senderOrSource.contains("Yahoo", ignoreCase = true)) "Yahoo Finance" else "네이버 증권"
            "[주식] $market"
        }
        "NEWS" -> {
            val publisher = senderOrSource.ifBlank { "언론사" }
            "[뉴스] $publisher · $dateStr"
        }
        "CALENDAR" -> {
            "[캘린더] $dateStr $timeStr"
        }
        "CONTACTS" -> {
            val name = titlePart.ifBlank { senderOrSource }
                .removePrefix("연락처:").removePrefix("연락처").trim()
                .substringBefore(" ").substringBefore("(").trim()
                .ifBlank { "연락처" }
            "[연락처] $name"
        }
        "DICTIONARY" -> {
            val word = titlePart.ifBlank { senderOrSource }.removePrefix("단어:").trim()
            "[사전] $word"
        }
        "CALL" -> {
            val caller = titlePart.ifBlank { senderOrSource }.removePrefix("통화 요약:").removePrefix("통화 기록:").trim().ifBlank { "통화" }
            "[통화] $caller · $timeStr"
        }
        else -> {
            "[HUD] $dateStr $timeStr"
        }
    }
}
