package com.assistant.realtimetip.data.repository

import com.assistant.realtimetip.data.local.dao.ConversationLogDao
import com.assistant.realtimetip.data.local.entity.ConversationLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class ConversationRepository(
    private val conversationLogDao: ConversationLogDao
) {
    val latestLogFlow: Flow<ConversationLog?> = conversationLogDao.getLatestLogFlow()
    val allLogsFlow: Flow<List<ConversationLog>> = conversationLogDao.getAllLogsFlow()

    fun getRecentLogsFlow(limit: Int = 20): Flow<List<ConversationLog>> {
        return conversationLogDao.getRecentLogsFlow(limit)
    }

    suspend fun saveLog(rawText: String, correctedText: String): Long {
        return withContext(Dispatchers.IO) {
            val log = ConversationLog(
                rawText = rawText,
                correctedText = correctedText,
                timestamp = System.currentTimeMillis()
            )
            conversationLogDao.insert(log)
        }
    }

    suspend fun clearAll() {
        withContext(Dispatchers.IO) {
            conversationLogDao.clearAll()
        }
    }
}
