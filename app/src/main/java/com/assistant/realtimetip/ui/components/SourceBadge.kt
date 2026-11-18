package com.assistant.realtimetip.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.assistant.realtimetip.ui.theme.CalendarBadgeColor
import com.assistant.realtimetip.ui.theme.CallBadgeColor
import com.assistant.realtimetip.ui.theme.ContactsBadgeColor
import com.assistant.realtimetip.ui.theme.EmailBadgeColor
import com.assistant.realtimetip.ui.theme.NewsBadgeColor
import com.assistant.realtimetip.ui.theme.StockBadgeColor
import com.assistant.realtimetip.ui.theme.WebBadgeColor

@Composable
fun SourceBadge(
    sourceType: String,
    modifier: Modifier = Modifier
) {
    val (badgeColor, label, icon) = when (sourceType.uppercase()) {
        "STOCK" -> Triple(StockBadgeColor, "실시간 주식", Icons.Default.TrendingUp)
        "WEB" -> Triple(WebBadgeColor, "웹 검색", Icons.Default.Language)
        "EMAIL" -> Triple(EmailBadgeColor, "이메일", Icons.Default.Email)
        "CALENDAR" -> Triple(CalendarBadgeColor, "캘린더", Icons.Default.CalendarToday)
        "CONTACTS" -> Triple(ContactsBadgeColor, "연락처", Icons.Default.Person)
        "CALL" -> Triple(CallBadgeColor, "통화 요약", Icons.Default.Phone)
        else -> Triple(NewsBadgeColor, "최신 뉴스", Icons.Default.Newspaper)
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(badgeColor.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = badgeColor,
                modifier = Modifier.size(13.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = "[$label]",
                color = badgeColor,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            )
        }
    }
}
