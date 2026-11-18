package com.assistant.realtimetip.data.repository

import com.assistant.realtimetip.data.local.dao.TipHistoryDao
import com.assistant.realtimetip.data.local.entity.TipHistory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class TipHistoryRepository(
    private val tipHistoryDao: TipHistoryDao
) {
    val allTipsFlow: Flow<List<TipHistory>> = tipHistoryDao.getAllTipsFlow()
    val latestTipFlow: Flow<TipHistory?> = tipHistoryDao.getLatestTipFlow()

    fun getTipsBySourceFlow(sourceType: String): Flow<List<TipHistory>> {
        return if (sourceType.equals("ALL", ignoreCase = true)) {
            tipHistoryDao.getAllTipsFlow()
        } else {
            tipHistoryDao.getTipsBySourceFlow(sourceType.uppercase())
        }
    }

    suspend fun getTipById(id: Long): TipHistory? {
        return withContext(Dispatchers.IO) {
            tipHistoryDao.getTipById(id)
        }
    }

    suspend fun saveTip(
        triggerText: String,
        generatedTip: String,
        referenceTitle: String,
        referenceContent: String,
        sourceType: String
    ): Long {
        return withContext(Dispatchers.IO) {
            val tip = TipHistory(
                triggerText = triggerText,
                generatedTip = generatedTip,
                referenceTitle = referenceTitle,
                referenceContent = referenceContent,
                sourceType = sourceType.uppercase(),
                timestamp = System.currentTimeMillis()
            )
            tipHistoryDao.insert(tip)
        }
    }

    suspend fun deleteById(id: Long) {
        withContext(Dispatchers.IO) {
            tipHistoryDao.deleteById(id)
        }
    }

    suspend fun clearAll() {
        withContext(Dispatchers.IO) {
            tipHistoryDao.clearAll()
        }
    }
}
