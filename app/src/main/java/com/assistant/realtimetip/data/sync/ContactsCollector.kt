package com.assistant.realtimetip.data.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * On-Device Contacts Collector querying ContactsContract.Data.
 * Triggers when a contact's person name or company name appears in spoken conversation,
 * returning phone numbers, affiliation/company, job title, and note summaries.
 */
class ContactsCollector(
    private val context: Context,
    private val callSummaryCollector: CallSummaryCollector? = null
) {

    data class ContactDetails(
        val contactId: Long,
        var displayName: String = "",
        var company: String = "",
        var jobTitle: String = "",
        var phone: String = "",
        var note: String = ""
    )

    companion object {
        private val CONTACT_INTENT_KEYWORDS = setOf(
            "연락처", "전화번호", "전화", "번호", "누구", "연락", "핸드폰", "휴대폰",
            "담당자", "직원", "명함", "팀장", "부장", "과장", "대리", "이사", "대표"
        )
    }

    fun hasContactsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Retrieves top contact display names for custom vocabulary biasing.
     */
    suspend fun getAllContactNames(limit: Int = 100): List<String> = withContext(Dispatchers.IO) {
        if (!hasContactsPermission()) return@withContext emptyList()
        val names = mutableListOf<String>()
        try {
            val projection = arrayOf(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
            val cursor = context.contentResolver.query(
                ContactsContract.Contacts.CONTENT_URI,
                projection,
                null,
                null,
                "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} ASC"
            )
            cursor?.use {
                val nameIdx = it.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
                while (it.moveToNext() && names.size < limit) {
                    if (nameIdx >= 0) {
                        val name = it.getString(nameIdx)?.trim() ?: ""
                        if (name.length in 2..12) {
                            names.add(name)
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        names.distinct()
    }

    /**
     * Searches ContactsContract for contacts whose name or company matches spoken words.
     */
    suspend fun collectMatchingContacts(
        conversation: String,
        keywords: List<String>,
        limit: Int = 3
    ): List<KnowledgeItem> = withContext(Dispatchers.IO) {
        if (!hasContactsPermission()) {
            return@withContext emptyList()
        }

        val hasContactIntent = CONTACT_INTENT_KEYWORDS.any { conversation.contains(it) } ||
                keywords.any { kw -> CONTACT_INTENT_KEYWORDS.any { kw.contains(it) } }

        // Only search with clean, meaningful keywords (at least 2 chars, not stop words)
        val validKeywords = keywords
            .map { it.trim().replace(Regex("""[^a-zA-Z0-9가-힣]"""), "") }
            .filter { it.length >= 2 && !CONTACT_INTENT_KEYWORDS.contains(it) }

        // If no explicit contact intent and no valid keywords, skip
        if (!hasContactIntent && validKeywords.isEmpty()) {
            return@withContext emptyList()
        }

        val searchTokens = if (validKeywords.isNotEmpty()) validKeywords else {
            conversation.split(" ")
                .map { it.trim().replace(Regex("""[^a-zA-Z0-9가-힣]"""), "") }
                .filter { it.length >= 2 && !CONTACT_INTENT_KEYWORDS.contains(it) }
        }

        if (searchTokens.isEmpty()) return@withContext emptyList()

        try {
            val contactMap = mutableMapOf<Long, ContactDetails>()

            val projection = arrayOf(
                ContactsContract.Data.CONTACT_ID,
                ContactsContract.Data.DISPLAY_NAME,
                ContactsContract.Data.MIMETYPE,
                ContactsContract.Data.DATA1,
                ContactsContract.Data.DATA4
            )

            for (token in searchTokens.take(4)) {
                // If explicit contact intent was spoken, allow prefix or match; otherwise require strict match
                val selection = if (hasContactIntent) {
                    """
                        ${ContactsContract.Data.DISPLAY_NAME} LIKE ? OR 
                        (${ContactsContract.Data.MIMETYPE} = '${ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE}' AND ${ContactsContract.Data.DATA1} LIKE ?)
                    """.trimIndent()
                } else {
                    """
                        ${ContactsContract.Data.DISPLAY_NAME} = ? OR 
                        ${ContactsContract.Data.DISPLAY_NAME} LIKE ? OR 
                        (${ContactsContract.Data.MIMETYPE} = '${ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE}' AND ${ContactsContract.Data.DATA1} = ?)
                    """.trimIndent()
                }

                val selectionArgs = if (hasContactIntent) {
                    arrayOf("%$token%", "%$token%")
                } else {
                    arrayOf(token, "$token%", token)
                }

                context.contentResolver.query(
                    ContactsContract.Data.CONTENT_URI,
                    projection,
                    selection,
                    selectionArgs,
                    "${ContactsContract.Data.DISPLAY_NAME} ASC"
                )?.use { cursor ->
                    val idIdx = cursor.getColumnIndex(ContactsContract.Data.CONTACT_ID)
                    val nameIdx = cursor.getColumnIndex(ContactsContract.Data.DISPLAY_NAME)
                    val mimeIdx = cursor.getColumnIndex(ContactsContract.Data.MIMETYPE)
                    val data1Idx = cursor.getColumnIndex(ContactsContract.Data.DATA1)
                    val data4Idx = cursor.getColumnIndex(ContactsContract.Data.DATA4)

                    while (cursor.moveToNext() && contactMap.size < 10) {
                        val contactId = if (idIdx >= 0) cursor.getLong(idIdx) else continue
                        val displayName = if (nameIdx >= 0) cursor.getString(nameIdx) ?: "" else ""
                        val mimeType = if (mimeIdx >= 0) cursor.getString(mimeIdx) ?: "" else ""
                        val data1 = if (data1Idx >= 0) cursor.getString(data1Idx) ?: "" else ""
                        val data4 = if (data4Idx >= 0) cursor.getString(data4Idx) ?: "" else ""

                        val contact = contactMap.getOrPut(contactId) {
                            ContactDetails(contactId = contactId, displayName = displayName)
                        }

                        if (contact.displayName.isBlank() && displayName.isNotBlank()) {
                            contact.displayName = displayName
                        }

                        when (mimeType) {
                            ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE -> {
                                if (contact.phone.isBlank()) contact.phone = data1
                            }
                            ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE -> {
                                if (contact.company.isBlank()) contact.company = data1
                                if (contact.jobTitle.isBlank()) contact.jobTitle = data4
                            }
                            ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE -> {
                                if (contact.note.isBlank()) contact.note = data1
                            }
                        }
                    }
                }
            }

            val validContacts = contactMap.values
                .filter { contact ->
                    contact.displayName.isNotBlank() && (hasContactIntent || contact.phone.isNotBlank() || contact.company.isNotBlank())
                }

            if (validContacts.isEmpty()) return@withContext emptyList()

            val results = mutableListOf<KnowledgeItem>()
            for (contact in validContacts.take(limit)) {
                val phoneStr = if (contact.phone.isNotBlank()) contact.phone else "전화번호 미등록"
                val recentCall = callSummaryCollector?.getRecentCallSummaryForContact(contact.displayName, contact.phone)
                    ?: "최근 통화 기록 없음"

                val lines = mutableListOf<String>()
                lines.add("- 👤 ${contact.displayName}")
                lines.add("- 📞 $phoneStr")
                lines.add("- 📞 최근 통화 내용: $recentCall")
                if (contact.note.isNotBlank()) {
                    lines.add("- 📝 메모: ${contact.note.take(50)}")
                }

                results.add(
                    KnowledgeItem(
                        sourceType = "CONTACTS",
                        title = contact.displayName,
                        senderOrSource = "연락처",
                        content = lines.joinToString("\n"),
                        keywords = "${contact.displayName}, 연락처, 전화번호",
                        timestamp = System.currentTimeMillis()
                    )
                )
            }
            results
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }
}
