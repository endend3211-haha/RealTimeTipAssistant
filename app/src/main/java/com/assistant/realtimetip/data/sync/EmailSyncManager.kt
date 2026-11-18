package com.assistant.realtimetip.data.sync

import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import com.assistant.realtimetip.data.repository.KnowledgeRepository
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import com.assistant.realtimetip.data.util.HtmlSanitizer
import com.assistant.realtimetip.data.util.KeywordExtractor
import com.assistant.realtimetip.data.util.TextSummarizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar
import java.util.Date
import java.util.Properties
import javax.mail.Folder
import javax.mail.Message
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.internet.InternetAddress
import javax.mail.search.ComparisonTerm
import javax.mail.search.ReceivedDateTerm
import javax.mail.search.SentDateTerm

/**
 * Connects to IMAP mail servers (SSL/TLS), retrieves emails within the lookback window,
 * parses multipart payloads, extracts keywords, and saves records into Room DB.
 */
class EmailSyncManager(
    private val securePreferenceManager: SecurePreferenceManager,
    private val knowledgeRepository: KnowledgeRepository
) {

    /**
     * Synchronizes emails within the configured lookback window.
     * Returns the count of newly inserted emails.
     */
    suspend fun syncEmails(): Result<Int> = withContext(Dispatchers.IO) {
        val host = securePreferenceManager.imapHost
        val port = securePreferenceManager.imapPort
        val email = securePreferenceManager.imapEmail
        val password = securePreferenceManager.imapPassword
        val lookbackDays = securePreferenceManager.imapLookbackDays

        if (email.isBlank() || password.isBlank()) {
            return@withContext Result.failure(
                IllegalStateException("이메일 계정 또는 앱 비밀번호가 설정되지 않았습니다.")
            )
        }

        val props = createMailProperties(host, port)
        var store: javax.mail.Store? = null
        var inbox: Folder? = null
        var insertedCount = 0

        try {
            val session = Session.getInstance(props)
            store = session.getStore("imaps")
            store.connect(host, port, email, password)

            inbox = store.getFolder("INBOX")
            inbox.open(Folder.READ_ONLY)

            val calendar = Calendar.getInstance()
            calendar.add(Calendar.DAY_OF_YEAR, -lookbackDays)
            val minDate = calendar.time

            // Search by received date or sent date term
            var messages = try {
                val receivedTerm = ReceivedDateTerm(ComparisonTerm.GE, minDate)
                inbox.search(receivedTerm)
            } catch (e: Exception) {
                emptyArray()
            }

            // Fallback to sent date term if received date term didn't match
            if (messages.isEmpty()) {
                messages = try {
                    val sentTerm = SentDateTerm(ComparisonTerm.GE, minDate)
                    inbox.search(sentTerm)
                } catch (e: Exception) {
                    emptyArray()
                }
            }

            // If search is still empty or unsupported by server, inspect recent messages
            if (messages.isEmpty()) {
                val totalMessages = inbox.messageCount
                if (totalMessages > 0) {
                    val startMsg = (totalMessages - 49).coerceAtLeast(1)
                    val candidateMessages = inbox.getMessages(startMsg, totalMessages)
                    messages = candidateMessages.filter { msg ->
                        val date = msg.receivedDate ?: msg.sentDate
                        date != null && date.after(minDate)
                    }.toTypedArray()
                }
            }

            for (message in messages) {
                try {
                    val subject = message.subject ?: "(제목 없음)"
                    val date = message.receivedDate ?: message.sentDate ?: Date()
                    val timestamp = date.time

                    // Deduplication check: check if already indexed
                    if (knowledgeRepository.existsByTitleAndSource(subject, "EMAIL")) {
                        continue
                    }

                    val sender = formatSender(message.from?.firstOrNull())
                    val rawBody = extractBody(message)

                    // 1. Extract concise 1~3 line summary of core message
                    val conciseSummary = TextSummarizer.summarizeEmail(rawBody, fallbackSubject = subject)

                    // 2. Extract core noun keywords from subject and concise summary
                    val combinedText = "$subject $conciseSummary"
                    val keywords = KeywordExtractor.extractKeywords(combinedText, maxKeywords = 15)

                    // 3. Immediately discard/omit rawBody from Room DB storage:
                    // Store ONLY sender, timestamp, and concise 3-line summary
                    val knowledgeItem = KnowledgeItem(
                        sourceType = "EMAIL",
                        title = subject,
                        senderOrSource = sender,
                        content = conciseSummary,
                        keywords = keywords,
                        timestamp = timestamp
                    )

                    knowledgeRepository.insertItem(knowledgeItem)
                    insertedCount++
                } catch (msgEx: Exception) {
                    // Log and continue with next message
                    msgEx.printStackTrace()
                }
            }

            Result.success(insertedCount)
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            try {
                inbox?.close(false)
            } catch (_: Exception) {}
            try {
                store?.close()
            } catch (_: Exception) {}
        }
    }

    /**
     * Tests the IMAP connection with stored credentials.
     * Returns a user-friendly status message.
     */
    suspend fun testConnection(): Result<String> = withContext(Dispatchers.IO) {
        val host = securePreferenceManager.imapHost
        val port = securePreferenceManager.imapPort
        val email = securePreferenceManager.imapEmail
        val password = securePreferenceManager.imapPassword

        if (email.isBlank() || password.isBlank()) {
            return@withContext Result.failure(
                IllegalArgumentException("이메일 주소와 16자리 앱 비밀번호를 입력해주세요.")
            )
        }

        val props = createMailProperties(host, port)
        var store: javax.mail.Store? = null
        var inbox: Folder? = null

        try {
            val session = Session.getInstance(props)
            store = session.getStore("imaps")
            store.connect(host, port, email, password)

            inbox = store.getFolder("INBOX")
            inbox.open(Folder.READ_ONLY)

            val totalCount = inbox.messageCount
            val unreadCount = inbox.unreadMessageCount

            Result.success("연결 성공: 받은편지함 메시지 총 ${totalCount}개 (읽지 않음: ${unreadCount}개)")
        } catch (e: Exception) {
            val errorMsg = when {
                e.message?.contains("authentication", ignoreCase = true) == true ->
                    "인증 실패: 이메일 또는 앱 비밀번호를 확인해주세요 (2단계 인증 전용 앱 비밀번호 권장)."
                e.message?.contains("connect", ignoreCase = true) == true ->
                    "서버 연결 실패: IMAP 호스트($host)와 포트($port)를 확인해주세요."
                else -> "오류 발생: ${e.localizedMessage ?: e.message}"
            }
            Result.failure(Exception(errorMsg, e))
        } finally {
            try {
                inbox?.close(false)
            } catch (_: Exception) {}
            try {
                store?.close()
            } catch (_: Exception) {}
        }
    }

    private fun createMailProperties(host: String, port: Int): Properties {
        return Properties().apply {
            put("mail.store.protocol", "imaps")
            put("mail.imaps.host", host)
            put("mail.imaps.port", port.toString())
            put("mail.imaps.ssl.enable", "true")
            put("mail.imaps.ssl.trust", "*")
            put("mail.imaps.connectiontimeout", "10000")
            put("mail.imaps.timeout", "15000")
        }
    }

    private fun formatSender(address: javax.mail.Address?): String {
        if (address == null) return "알 수 없음"
        if (address is InternetAddress) {
            val personal = address.personal
            return if (!personal.isNullOrBlank()) {
                "$personal <${address.address}>"
            } else {
                address.address ?: address.toString()
            }
        }
        return address.toString()
    }

    private fun extractBody(part: Part): String {
        return try {
            if (part.isMimeType("text/plain")) {
                part.content as? String ?: ""
            } else if (part.isMimeType("text/html")) {
                val html = part.content as? String ?: ""
                HtmlSanitizer.stripHtml(html)
            } else if (part.isMimeType("multipart/*")) {
                val mp = part.content as? Multipart ?: return ""
                val sb = StringBuilder()
                for (i in 0 until mp.count) {
                    val body = extractBody(mp.getBodyPart(i))
                    if (body.isNotBlank()) {
                        sb.append(body).append("\n")
                    }
                }
                sb.toString()
            } else {
                ""
            }
        } catch (e: Exception) {
            ""
        }
    }
}
