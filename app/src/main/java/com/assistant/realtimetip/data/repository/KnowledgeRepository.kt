package com.assistant.realtimetip.data.repository

import com.assistant.realtimetip.data.local.dao.KnowledgeDao
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class KnowledgeRepository(
    private val knowledgeDao: KnowledgeDao
) {
    val allKnowledgeFlow: Flow<List<KnowledgeItem>> = knowledgeDao.getAllFlow()
    val totalCountFlow: Flow<Int> = knowledgeDao.getTotalCountFlow()
    val emailCountFlow: Flow<Int> = knowledgeDao.getEmailCountFlow()
    val newsCountFlow: Flow<Int> = knowledgeDao.getNewsCountFlow()
    val lastSyncTimestampFlow: Flow<Long?> = knowledgeDao.getLastSyncTimestampFlow()

    fun searchKnowledge(query: String): Flow<List<KnowledgeItem>> {
        return knowledgeDao.searchKnowledgeFlow(query)
    }

    suspend fun searchMatchingFts(query: String, limit: Int = 3): List<KnowledgeItem> {
        return withContext(Dispatchers.IO) {
            try {
                knowledgeDao.searchMatchingFts(query, limit)
            } catch (_: Exception) {
                knowledgeDao.searchLike(query, limit)
            }
        }
    }

    /**
     * Retrieves up to [limit] (default: 3) most recent KnowledgeItems matching the extracted keywords,
     * filtered strictly by allowed source types (e.g. "EMAIL", "NEWS").
     */
    suspend fun findTopMatchingByKeywordsFiltered(
        keywords: List<String>,
        allowedSources: List<String>,
        limit: Int = 3
    ): List<KnowledgeItem> {
        return withContext(Dispatchers.IO) {
            knowledgeDao.findTopMatchingByKeywordsFiltered(keywords, allowedSources, limit)
        }
    }

    /**
     * Retrieves up to [limit] (default: 3) most recent KnowledgeItems matching the extracted keywords.
     */
    suspend fun findTopMatchingByKeywords(keywords: List<String>, limit: Int = 3): List<KnowledgeItem> {
        return withContext(Dispatchers.IO) {
            knowledgeDao.findTopMatchingByKeywords(keywords, limit)
        }
    }

    /**
     * Retrieves up to [limit] (default: 50) distinct domain noun keywords from recent knowledge items
     * to feed into SpeechRecognizer biasing strings.
     */
    suspend fun getRecentBiasingKeywords(limit: Int = 50): List<String> {
        return withContext(Dispatchers.IO) {
            knowledgeDao.getRecentBiasingKeywords(limit)
        }
    }

    suspend fun existsByTitleAndSource(title: String, sourceType: String): Boolean {
        return withContext(Dispatchers.IO) {
            knowledgeDao.existsByTitleAndSource(title, sourceType)
        }
    }

    suspend fun insertItem(item: KnowledgeItem): Long {
        return withContext(Dispatchers.IO) {
            knowledgeDao.insert(item)
        }
    }

    suspend fun insertItems(items: List<KnowledgeItem>): List<Long> {
        return withContext(Dispatchers.IO) {
            knowledgeDao.insertAll(items)
        }
    }

    suspend fun deleteById(id: Long) {
        withContext(Dispatchers.IO) {
            knowledgeDao.deleteById(id)
        }
    }

    suspend fun clearAll() {
        withContext(Dispatchers.IO) {
            knowledgeDao.clearAll()
        }
    }
}
