package com.assistant.realtimetip.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.assistant.realtimetip.data.local.entity.TipHistory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class ParsedContactTip(
    val contactName: String,
    val phoneNumber: String,
    val recentCallSummary: String
)

data class ParsedStockTip(
    val stockName: String,
    val stockCode: String,
    val priceSummary: String
)

data class ParsedWebTip(
    val title: String,
    val source: String,
    val coreSummary: String
)

fun parseContactTip(tip: TipHistory): ParsedContactTip {
    val rawLines = (tip.referenceContent + "\n" + tip.generatedTip).lines().map { it.trim() }

    // Header Format: [Contact Name] only (remove company/organization)
    val titlePart = if (tip.referenceTitle.contains("|")) tip.referenceTitle.substringAfter("|").trim() else tip.referenceTitle.trim()
    var name = titlePart.removePrefix("연락처:").removePrefix("연락처").trim()
    name = name.substringBefore("(").substringBefore(" ").trim()
    if (name.isBlank() || name == "연락처") {
        name = rawLines.firstOrNull { it.contains("👤") }
            ?.replace("👤", "")?.removePrefix("-")?.removePrefix("이름:")?.trim()
            ?.substringBefore("(")?.substringBefore(" ")?.trim() ?: "연락처"
    }

    // Phone Number Display: remove "휴대 전화" text label, keep phone number
    var phone = rawLines.firstOrNull { it.contains("📞") && !it.contains("최근 통화") && !it.contains("통화") }
        ?.replace("📞", "")?.removePrefix("-")?.replace(Regex("""휴대\s*전화\s*[:\s]*"""), "")?.trim() ?: ""
    if (phone.isBlank()) {
        val phoneMatch = Regex("""\b01[0-9]-?[0-9]{3,4}-?[0-9]{4}\b""").find(tip.referenceContent + " " + tip.generatedTip)
        phone = phoneMatch?.value ?: "전화번호 미등록"
    }

    // Recent Call Summary (Replace "최근 상태")
    var recentCall = rawLines.firstOrNull { it.contains("최근 통화 내용") }
        ?.substringAfter("최근 통화 내용:")?.removePrefix("-")?.trim() ?: ""
    if (recentCall.isBlank()) {
        recentCall = rawLines.firstOrNull { it.contains("통화 일시") || it.contains("통화 기록") }
            ?.removePrefix("-")?.trim() ?: "최근 통화 기록 없음"
    }

    return ParsedContactTip(
        contactName = name,
        phoneNumber = phone,
        recentCallSummary = recentCall
    )
}

fun parseStockTip(tip: TipHistory): ParsedStockTip {
    val rawLines = (tip.generatedTip + "\n" + tip.referenceContent).lines().map { it.trim() }

    val title = tip.referenceTitle.removePrefix("[💡 TIP]").removePrefix("[주식]").trim()
    val name = title.substringBefore("(").trim().ifBlank { "주식 시세" }
    val code = if (title.contains("(")) title.substringAfter("(").substringBefore(")").trim() else ""

    val priceLine = rawLines.firstOrNull { line ->
        (line.contains("원") || line.contains("pt") || line.contains("$")) &&
        !line.contains("시장 현황") && !line.contains("시장현황") &&
        !line.contains("투자동향") && !line.contains("투자 동향") &&
        !line.contains("출처 및 기준") && !line.contains("필요한 정보")
    }?.removePrefix("-")?.trim() ?: tip.generatedTip.lines().firstOrNull() ?: ""

    return ParsedStockTip(
        stockName = name,
        stockCode = code,
        priceSummary = priceLine
    )
}

fun parseWebTip(tip: TipHistory): ParsedWebTip {
    val rawLines = (tip.generatedTip + "\n" + tip.referenceContent).lines().map { it.trim() }

    // Strip: 세부내용, 연관 시사점, 연관키워드
    val filteredLines = rawLines.filter { line ->
        val l = line.removePrefix("-").trim()
        l.isNotBlank() &&
        !l.contains("세부내용") && !l.contains("세부 내용") &&
        !l.contains("연관 시사점") && !l.contains("연관시사점") &&
        !l.contains("연관키워드") && !l.contains("연관 키워드") &&
        !l.contains("필요한 정보")
    }

    val source = tip.referenceTitle.substringBefore("|").removePrefix("[💡 TIP]").removePrefix("[웹 검색]").trim().ifBlank { "웹 검색" }
    val title = if (tip.referenceTitle.contains("|")) tip.referenceTitle.substringAfter("|").trim() else tip.referenceTitle

    val coreSummary = filteredLines.firstOrNull { it.contains("💡") }
        ?: filteredLines.firstOrNull { it != title }
        ?: tip.generatedTip

    return ParsedWebTip(
        title = title,
        source = source,
        coreSummary = coreSummary.removePrefix("-").removePrefix("💡").trim()
    )
}

@Composable
fun TipHighlightCard(
    tip: TipHistory?,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val context = LocalContext.current

    AnimatedVisibility(
        visible = tip != null,
        enter = slideInVertically(
            initialOffsetY = { -40 },
            animationSpec = tween(durationMillis = 350, easing = FastOutSlowInEasing)
        ) + fadeIn(),
        exit = fadeOut()
    ) {
        if (tip != null) {
            Card(
                modifier = modifier
                    .fillMaxWidth()
                    .animateContentSize()
                    .clip(RoundedCornerShape(16.dp))
                    .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                ),
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp)
                ) {
                    // Header: Source Badge + Time + Copy Action
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SourceBadge(sourceType = tip.sourceType)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = formatTime(tip.timestamp),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        IconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                val clip = ClipData.newPlainText("Actionable Tip", tip.generatedTip)
                                clipboard.setPrimaryClip(clip)
                                Toast.makeText(context, "팁이 클립보드에 복사되었습니다.", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.ContentCopy,
                                contentDescription = "팁 복사",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Specialized Clean Tip Content Layout per Source Type
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
                            // General Default Layout
                            Text(
                                text = tip.generatedTip,
                                style = MaterialTheme.typography.bodyLarge.copy(
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    lineHeight = 25.sp
                               ),
                                color = MaterialTheme.colorScheme.onSurface
                            )

                            Spacer(modifier = Modifier.height(14.dp))

                            Surface(
                                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Lightbulb,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(14.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "근거: ${tip.referenceTitle}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1
                                        )
                                    }
                                    if (onClick != null) {
                                        Icon(
                                            imageVector = Icons.Outlined.ChevronRight,
                                            contentDescription = "상세 보기",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ContactTipCardContent(
    parsed: ParsedContactTip
) {
    Column {
        // 1. Header Format: Display only [Icon] [Contact Name] (no company/org)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = parsed.contactName,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                ),
                color = MaterialTheme.colorScheme.onSurface
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // 2. Phone Number Display: Single phone icon followed by phone number (no "휴대 전화" text label)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Phone,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(17.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = parsed.phoneNumber,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                    fontFamily = FontFamily.Monospace
                ),
                color = MaterialTheme.colorScheme.onSurface
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // 3. Recent Call Summary (Replacing "최근 상태")
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "최근 통화 내용: ",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = parsed.recentCallSummary,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        // AI 추천 and generic footer boilerplate completely removed!
    }
}

@Composable
fun StockTipCardContent(
    parsed: ParsedStockTip
) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.Default.TrendingUp,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (parsed.stockCode.isNotBlank()) "${parsed.stockName} (${parsed.stockCode})" else parsed.stockName,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                ),
                color = MaterialTheme.colorScheme.onSurface
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Compact, essential stock price/ticker summary
        Text(
            text = parsed.priceSummary,
            style = MaterialTheme.typography.bodyLarge.copy(
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                lineHeight = 23.sp
            ),
            color = MaterialTheme.colorScheme.onSurface
        )
        // Redundant sections: "시장 현황", "투자동향", "출처 및 기준", and generic footer completely removed!
    }
}

@Composable
fun WebSearchTipCardContent(
    parsed: ParsedWebTip
) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Language,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = parsed.title,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                ),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Concise core search result needed for glanceability
        Text(
            text = parsed.coreSummary,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = FontWeight.Normal,
                fontSize = 15.sp,
                lineHeight = 22.sp
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        // Redundant sections: "세부내용", "연관 시사점", "연관키워드" completely removed!
    }
}

private fun formatTime(timestamp: Long): String {
    val sdf = SimpleDateFormat("a h:mm", Locale.KOREA)
    return sdf.format(Date(timestamp))
}
