package com.assistant.realtimetip.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.assistant.realtimetip.data.local.entity.TipHistory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TipDetailBottomSheet(
    tip: TipHistory?,
    sheetState: SheetState,
    onDismissRequest: () -> Unit
) {
    if (tip == null) return

    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Header: Source Badge & Timestamp
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                SourceBadge(sourceType = tip.sourceType)
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = formatDateTime(tip.timestamp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Actionable Tip Section (Clean per Source Type)
            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = Icons.Default.Lightbulb,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .size(22.dp)
                        .padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "실시간 추천 팁",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    when (tip.sourceType.uppercase()) {
                        "CONTACTS" -> {
                            val parsed = parseContactTip(tip)
                            ContactTipCardContent(parsed = parsed)
                        }
                        "STOCK" -> {
                            val parsed = parseStockTip(tip)
                            StockTipCardContent(parsed = parsed)
                        }
                        "WEB" -> {
                            val parsed = parseWebTip(tip)
                            WebSearchTipCardContent(parsed = parsed)
                        }
                        else -> {
                            Text(
                                text = tip.generatedTip,
                                style = MaterialTheme.typography.bodyLarge.copy(
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    lineHeight = 26.sp
                                ),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            Spacer(modifier = Modifier.height(20.dp))

            // Trigger Conversation Section
            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = Icons.Default.ChatBubbleOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier
                        .size(20.dp)
                        .padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = "발화된 원본 대화",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.secondary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "\"${tip.triggerText}\"",
                        style = MaterialTheme.typography.bodyMedium.copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            Spacer(modifier = Modifier.height(20.dp))

            // Referenced Source Excerpt
            val sourceLabel = when (tip.sourceType.uppercase()) {
                "CONTACTS" -> "연락처"
                "STOCK" -> "실시간 주식"
                "WEB" -> "웹 검색"
                "EMAIL" -> "이메일"
                "NEWS" -> "뉴스"
                "CALENDAR" -> "캘린더"
                "CALL" -> "통화"
                "DICTIONARY" -> "사전"
                else -> tip.sourceType
            }

            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = Icons.Default.Description,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier
                        .size(20.dp)
                        .padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = "참조 근거 원문 [$sourceLabel]",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.tertiary
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    val cleanRefTitle = if (tip.sourceType == "CONTACTS") {
                        parseContactTip(tip).contactName
                    } else {
                        tip.referenceTitle
                    }

                    Text(
                        text = cleanRefTitle,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                            .padding(12.dp)
                    ) {
                        // Filter out redundant boilerplate from reference content
                        val cleanContentLines = tip.referenceContent.lines().filter { line ->
                            val l = line.trim()
                            !l.contains("실시간 음성대화중") && !l.contains("실시간 음성 대화중") &&
                            !l.contains("필요한 정보를 자동으로") &&
                            !l.contains("AI 추천") && !l.contains("AI추천") &&
                            !l.contains("시장 현황") && !l.contains("투자동향") && !l.contains("투자 동향") &&
                            !l.contains("출처 및 기준") && !l.contains("AI 투자 조언") &&
                            !l.contains("세부내용") && !l.contains("세부 내용") &&
                            !l.contains("연관 시사점") && !l.contains("연관시사점") &&
                            !l.contains("연관키워드") && !l.contains("연관 키워드")
                        }.joinToString("\n").trim()

                        Text(
                            text = cleanContentLines.ifBlank { "(본문 내용 없음)" },
                            style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 22.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

private fun formatDateTime(timestamp: Long): String {
    val sdf = SimpleDateFormat("yyyy.MM.dd a h:mm", Locale.KOREA)
    return sdf.format(Date(timestamp))
}
