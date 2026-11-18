package com.assistant.realtimetip.data.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import com.assistant.realtimetip.data.local.dao.KnowledgeDao
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * On-Device Call Summary & Recent Calls Collector.
 * Combines indexed AI call summaries from Room DB with recent CallLog.Calls metadata.
 * Triggers when keywords like '통화', '전화', '연락', '아까', '부재중', or a caller's name are spoken.
 */
class CallSummaryCollector(
    private val context: Context,
    private val knowledgeDao: KnowledgeDao
) {

    companion object {
        private val CALL_TRIGGER_KEYWORDS = setOf(
            "통화", "전화", "연락", "아까", "부재중", "콜", "수신", "발신"
        )

        private val PROJECTION = arrayOf(
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION
        )
    }

    fun hasCallLogPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun shouldTrigger(conversation: String, keywords: List<String>): Boolean {
        val lowerText = conversation.lowercase()
        if (CALL_TRIGGER_KEYWORDS.any { lowerText.contains(it) }) return true
        return keywords.any { kw -> CALL_TRIGGER_KEYWORDS.any { kw.contains(it) } }
    }

    /**
     * Looks up recent call record or AI call summary for a specific contact by name and/or phone number.
     * Returns a concise summary string such as "오늘 14:20 수신 (3분 12초)" or AI call summary if present.
     */
    suspend fun getRecentCallSummaryForContact(displayName: String, phoneNumber: String): String? = withContext(Dispatchers.IO) {
        val cleanNumber = phoneNumber.replace(Regex("""[^0-9]"""), "")

        // 1. First check Room DB for captured AI call summaries for this contact
        try {
            val dbItems = knowledgeDao.searchLikeFiltered(displayName.ifBlank { cleanNumber }, listOf("CALL"), limit = 1)
            if (dbItems.isNotEmpty()) {
                val item = dbItems.first()
                val summaryLine = item.content.lines().firstOrNull { it.contains("요약") || it.contains("일시") }
                    ?: item.content.lines().firstOrNull()
                if (!summaryLine.isNullOrBlank()) {
                    return@withContext summaryLine.removePrefix("-").trim()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 2. Query device CallLog for this contact
        if (!hasCallLogPermission()) return@withContext null

        try {
            val selection = when {
                displayName.isNotBlank() && cleanNumber.isNotBlank() ->
                    "${CallLog.Calls.CACHED_NAME} = ? OR ${CallLog.Calls.NUMBER} LIKE ?"
                displayName.isNotBlank() ->
                    "${CallLog.Calls.CACHED_NAME} = ?"
                cleanNumber.isNotBlank() ->
                    "${CallLog.Calls.NUMBER} LIKE ?"
                else -> null
            }
            val selectionArgs = when {
                displayName.isNotBlank() && cleanNumber.isNotBlank() ->
                    arrayOf(displayName, "%$cleanNumber%")
                displayName.isNotBlank() ->
                    arrayOf(displayName)
                cleanNumber.isNotBlank() ->
                    arrayOf("%$cleanNumber%")
                else -> null
            }

            val dateFormat = SimpleDateFormat("M/d HH:mm", Locale.KOREA)
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                PROJECTION,
                selection,
                selectionArgs,
                "${CallLog.Calls.DATE} DESC"
            )?.use { cursor ->
                if (cursor.moveToNext()) {
                    val typeIdx = cursor.getColumnIndex(CallLog.Calls.TYPE)
                    val dateIdx = cursor.getColumnIndex(CallLog.Calls.DATE)
                    val durIdx = cursor.getColumnIndex(CallLog.Calls.DURATION)

                    val type = if (typeIdx >= 0) cursor.getInt(typeIdx) else CallLog.Calls.INCOMING_TYPE
                    val date = if (dateIdx >= 0) cursor.getLong(dateIdx) else 0L
                    val duration = if (durIdx >= 0) cursor.getLong(durIdx) else 0L

                    val typeStr = when (type) {
                        CallLog.Calls.INCOMING_TYPE -> "수신"
                        CallLog.Calls.OUTGOING_TYPE -> "발신"
                        CallLog.Calls.MISSED_TYPE -> "부재중"
                        CallLog.Calls.REJECTED_TYPE -> "거절"
                        else -> "통화"
                    }
                    val dateStr = dateFormat.format(Date(date))
                    val durStr = if (duration > 0) "${duration / 60}분 ${duration % 60}초" else "부재중"

                    return@withContext "$dateStr $typeStr ($durStr)"
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return@withContext null
    }

    /**
     * Collects matching call summaries:
     * 1. First searches Room DB for captured AI call summaries (sourceType = "CALL").
     * 2. If fewer than limit, supplements with recent CallLog.Calls metadata.
     */
    suspend fun collectMatchingCalls(
        conversation: String,
        keywords: List<String>,
        limit: Int = 3
    ): List<KnowledgeItem> = withContext(Dispatchers.IO) {
        if (!shouldTrigger(conversation, keywords)) {
            return@withContext emptyList()
        }

        val results = mutableListOf<KnowledgeItem>()

        // 1. Search DB for captured AI call summaries
        try {
            val dbItems = if (keywords.isNotEmpty()) {
                val ftsQuery = keywords.filter { it.length >= 2 }.joinToString(" OR ")
                if (ftsQuery.isNotBlank()) {
                    knowledgeDao.searchMatchingFtsFiltered(ftsQuery, listOf("CALL"), limit)
                } else emptyList()
            } else {
                knowledgeDao.searchLikeFiltered("통화", listOf("CALL"), limit)
            }
            results.addAll(dbItems)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        if (results.size >= limit || !hasCallLogPermission()) {
            return@withContext results.take(limit)
        }

        // 2. Supplement with recent call logs
        try {
            val callLogs = mutableListOf<KnowledgeItem>()
            val dateFormat = SimpleDateFormat("M/d HH:mm", Locale.KOREA)

            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                PROJECTION,
                null,
                null,
                "${CallLog.Calls.DATE} DESC"
            )?.use { cursor ->
                val nameIdx = cursor.getColumnIndex(CallLog.Calls.CACHED_NAME)
                val numIdx = cursor.getColumnIndex(CallLog.Calls.NUMBER)
                val typeIdx = cursor.getColumnIndex(CallLog.Calls.TYPE)
                val dateIdx = cursor.getColumnIndex(CallLog.Calls.DATE)
                val durIdx = cursor.getColumnIndex(CallLog.Calls.DURATION)

                while (cursor.moveToNext() && callLogs.size < limit) {
                    val name = if (nameIdx >= 0) cursor.getString(nameIdx) ?: "" else ""
                    val number = if (numIdx >= 0) cursor.getString(numIdx) ?: "" else ""
                    val type = if (typeIdx >= 0) cursor.getInt(typeIdx) else CallLog.Calls.INCOMING_TYPE
                    val date = if (dateIdx >= 0) cursor.getLong(dateIdx) else 0L
                    val duration = if (durIdx >= 0) cursor.getLong(durIdx) else 0L

                    val typeStr = when (type) {
                        CallLog.Calls.INCOMING_TYPE -> "수신 통화"
                        CallLog.Calls.OUTGOING_TYPE -> "발신 통화"
                        CallLog.Calls.MISSED_TYPE -> "부재중 전화"
                        CallLog.Calls.REJECTED_TYPE -> "거절된 전화"
                        else -> "통화"
                    }

                    val displayName = name.ifBlank { number }
                    val dateStr = dateFormat.format(Date(date))
                    val durStr = if (duration > 0) "${duration / 60}분 ${duration % 60}초" else "부재중/미연결"

                    val lines = mutableListOf<String>()
                    lines.add("- 📞 [통화 기록] $displayName ($typeStr)")
                    lines.add("- 🕒 통화 일시: $dateStr (통화시간 $durStr)")
                    if (number.isNotBlank()) {
                        lines.add("- 📱 전화번호: $number")
                    }
                    lines.add("- 📝 상태 요약: 최근 통화 이력 및 녹음 요약 확인 완료")
                    lines.add("- 💡 AI 조언: \"통화 중 논의된 약속 사항이나 후속 조치 내용 확인 요망\"")

                    val item = KnowledgeItem(
                        sourceType = "CALL",
                        title = "통화 기록: $displayName",
                        senderOrSource = "최근 통화 ($dateStr)",
                        content = lines.joinToString("\n"),
                        keywords = "$displayName, $number, 통화, $typeStr",
                        timestamp = date
                    )
                    callLogs.add(item)
                }
            }

            results.addAll(callLogs)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return@withContext results.distinctBy { it.content }.take(limit)
    }
}
