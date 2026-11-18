package com.assistant.realtimetip.data.sync

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * On-Device Calendar Collector querying Android CalendarContract.Instances.
 * Triggers when dates, days of week (오늘, 내일, 모레, 월~일), or schedule keywords
 * (일정, 회의, 약속, 미팅, 시간, 스케줄) appear in spoken conversation.
 */
class CalendarCollector(
    private val context: Context
) {

    companion object {
        private val SCHEDULE_TRIGGER_KEYWORDS = setOf(
            "오늘", "내일", "모레", "글피",
            "이번주", "이번 주", "다음주", "다음 주",
            "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일",
            "일정", "스케줄", "약속", "회의", "미팅", "시간", "캘린더", "행사"
        )

        private val PROJECTION = arrayOf(
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.DESCRIPTION
        )
    }

    /**
     * Checks if spoken conversation or extracted keywords match calendar schedule triggers.
     */
    fun shouldTrigger(conversation: String, keywords: List<String>): Boolean {
        val lowerText = conversation.lowercase()
        if (SCHEDULE_TRIGGER_KEYWORDS.any { lowerText.contains(it) }) return true
        return keywords.any { kw -> SCHEDULE_TRIGGER_KEYWORDS.any { kw.contains(it) } }
    }

    /**
     * Queries calendar events from today through the next 14 days and returns matching KnowledgeItems.
     */
    suspend fun collectMatchingEvents(
        conversation: String,
        keywords: List<String>,
        limit: Int = 3
    ): List<KnowledgeItem> = withContext(Dispatchers.IO) {
        if (!hasCalendarPermission()) {
            return@withContext emptyList()
        }

        if (!shouldTrigger(conversation, keywords)) {
            return@withContext emptyList()
        }

        try {
            val startCal = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val startMillis = startCal.timeInMillis
            val endMillis = startMillis + (14L * 24 * 60 * 60 * 1000) // Next 14 days

            val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
            ContentUris.appendId(builder, startMillis)
            ContentUris.appendId(builder, endMillis)
            val uri = builder.build()

            val events = mutableListOf<CalendarEventData>()

            context.contentResolver.query(
                uri,
                PROJECTION,
                null,
                null,
                "${CalendarContract.Instances.BEGIN} ASC"
            )?.use { cursor ->
                val titleIdx = cursor.getColumnIndex(CalendarContract.Instances.TITLE)
                val beginIdx = cursor.getColumnIndex(CalendarContract.Instances.BEGIN)
                val endIdx = cursor.getColumnIndex(CalendarContract.Instances.END)
                val locIdx = cursor.getColumnIndex(CalendarContract.Instances.EVENT_LOCATION)
                val allDayIdx = cursor.getColumnIndex(CalendarContract.Instances.ALL_DAY)
                val descIdx = cursor.getColumnIndex(CalendarContract.Instances.DESCRIPTION)

                while (cursor.moveToNext()) {
                    val title = if (titleIdx >= 0) cursor.getString(titleIdx) ?: "" else ""
                    val begin = if (beginIdx >= 0) cursor.getLong(beginIdx) else 0L
                    val end = if (endIdx >= 0) cursor.getLong(endIdx) else 0L
                    val location = if (locIdx >= 0) cursor.getString(locIdx) ?: "" else ""
                    val isAllDay = if (allDayIdx >= 0) cursor.getInt(allDayIdx) == 1 else false
                    val description = if (descIdx >= 0) cursor.getString(descIdx) ?: "" else ""

                    if (title.isNotBlank()) {
                        events.add(CalendarEventData(title, begin, end, location, isAllDay, description))
                    }
                }
            }

            if (events.isEmpty()) return@withContext emptyList()

            // Filter specific events based on target day/keywords if present
            val matchedEvents = filterEventsByConversation(events, conversation, keywords)

            val dateFormat = SimpleDateFormat("M/d (E) HH:mm", Locale.KOREA)
            val allDayFormat = SimpleDateFormat("M/d (E) 하루 종일", Locale.KOREA)

            matchedEvents.take(limit).map { event ->
                val timeStr = if (event.isAllDay) {
                    allDayFormat.format(Date(event.begin))
                } else {
                    val startStr = dateFormat.format(Date(event.begin))
                    val endFormat = SimpleDateFormat("HH:mm", Locale.KOREA)
                    "$startStr~${endFormat.format(Date(event.end))}"
                }

                val locStr = if (event.location.isNotBlank()) event.location else "장소 미지정"
                val descStr = if (event.description.isNotBlank()) event.description.take(60) else "상세 내용 없음"

                val lines = mutableListOf<String>()
                lines.add("- 📅 일정: ${event.title}")
                lines.add("- 🕒 일시: $timeStr")
                if (event.location.isNotBlank()) {
                    lines.add("- 📍 장소: $locStr")
                }
                lines.add("- 📝 내용: $descStr")
                lines.add("- 👥 참석: 일정 등록 대상자 전원")
                lines.add("- 💡 AI 조언: \"일정 시작 10분 전 사전 입장 및 필요 자료 검토 권장\"")

                KnowledgeItem(
                    sourceType = "CALENDAR",
                    title = "일정: ${event.title}",
                    senderOrSource = "캘린더 ($timeStr)",
                    content = lines.joinToString("\n"),
                    keywords = "${event.title}, 일정, ${event.location}",
                    timestamp = event.begin
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    private fun filterEventsByConversation(
        events: List<CalendarEventData>,
        conversation: String,
        keywords: List<String>
    ): List<CalendarEventData> {
        val nowCal = Calendar.getInstance()
        val today = nowCal.get(Calendar.DAY_OF_YEAR)

        val tomorrowCal = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 1) }
        val tomorrow = tomorrowCal.get(Calendar.DAY_OF_YEAR)

        return when {
            conversation.contains("오늘") -> events.filter {
                val cal = Calendar.getInstance().apply { timeInMillis = it.begin }
                cal.get(Calendar.DAY_OF_YEAR) == today
            }
            conversation.contains("내일") -> events.filter {
                val cal = Calendar.getInstance().apply { timeInMillis = it.begin }
                cal.get(Calendar.DAY_OF_YEAR) == tomorrow
            }
            else -> {
                // Check if any keyword matches event title
                val keywordMatched = events.filter { event ->
                    keywords.any { kw -> kw.length >= 2 && event.title.contains(kw) }
                }
                keywordMatched.ifEmpty { events }
            }
        }
    }

    fun hasCalendarPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CALENDAR
        ) == PackageManager.PERMISSION_GRANTED
    }

    private data class CalendarEventData(
        val title: String,
        val begin: Long,
        val end: Long,
        val location: String,
        val isAllDay: Boolean,
        val description: String
    )
}
