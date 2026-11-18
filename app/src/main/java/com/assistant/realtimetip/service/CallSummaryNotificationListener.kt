package com.assistant.realtimetip.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.assistant.realtimetip.data.local.AppDatabase
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Captures post-call AI summary notifications from Samsung Dialer, SKT A. (에이닷),
 * and T-Phone, automatically indexing them into Room DB as KnowledgeItem(sourceType = "CALL").
 */
class CallSummaryNotificationListener : NotificationListenerService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        private val TARGET_PACKAGES = setOf(
            "com.samsung.android.dialer",
            "com.samsung.android.incallui",
            "com.skt.prod.dialer",
            "com.skt.prod.phone"
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        sbn ?: return

        val packageName = sbn.packageName ?: return

        // Check if from target dialer packages or title/text contains call summary keywords
        val isTargetApp = TARGET_PACKAGES.contains(packageName)

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim() ?: ""

        val rawSummary = bigText.ifBlank { text }
        if (rawSummary.isBlank()) return

        val isCallSummaryContent = rawSummary.contains("통화 요약") ||
                rawSummary.contains("통화 녹음") ||
                rawSummary.contains("에이닷") ||
                title.contains("통화 요약") ||
                subText.contains("통화")

        if (isTargetApp || isCallSummaryContent) {
            val sourceLabel = when {
                packageName.contains("samsung") -> "삼성 통화 AI"
                packageName.contains("dialer") -> "에이닷(A.) 통화 요약"
                packageName.contains("phone") -> "T전화 AI 요약"
                else -> "통화 AI 요약"
            }

            val dateFormat = SimpleDateFormat("yyyy.MM.dd HH:mm", Locale.KOREA)
            val dateStr = dateFormat.format(Date(sbn.postTime))

            val callerName = title.ifBlank { "통화 상대" }
            val cleanSummary = rawSummary.replace("\n", " ").trim().take(250)

            val knowledgeItem = KnowledgeItem(
                sourceType = "CALL",
                title = "통화 요약: $callerName",
                senderOrSource = sourceLabel,
                content = "- 상대: $callerName\n- 요약: $cleanSummary\n- 일시: $dateStr",
                keywords = "$callerName, 통화, 요약, 전화, $sourceLabel",
                timestamp = sbn.postTime
            )

            serviceScope.launch {
                try {
                    val db = AppDatabase.getInstance(applicationContext)
                    db.knowledgeDao().insert(knowledgeItem)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }
}
