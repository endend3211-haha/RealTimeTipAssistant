package com.assistant.realtimetip.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import kotlinx.coroutines.flow.Flow

@Dao
interface KnowledgeDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: KnowledgeItem): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<KnowledgeItem>): List<Long>

    /**
     * FTS4 query returning KnowledgeItems where title, content, or keywords match the query string,
     * filtered strictly by allowed source types (e.g. "EMAIL", "NEWS").
     */
    @Query("""
        SELECT knowledge_items.* FROM knowledge_items
        JOIN knowledge_fts ON knowledge_items.id = knowledge_fts.rowid
        WHERE knowledge_fts MATCH :ftsQuery
          AND knowledge_items.sourceType IN (:allowedSources)
        ORDER BY knowledge_items.timestamp DESC
        LIMIT :limit
    """)
    suspend fun searchMatchingFtsFiltered(
        ftsQuery: String,
        allowedSources: List<String>,
        limit: Int = 3
    ): List<KnowledgeItem>

    /**
     * Fallback LIKE query filtered strictly by allowed source types.
     */
    @Query("""
        SELECT * FROM knowledge_items
        WHERE (title LIKE '%' || :query || '%'
           OR content LIKE '%' || :query || '%'
           OR keywords LIKE '%' || :query || '%')
          AND sourceType IN (:allowedSources)
        ORDER BY timestamp DESC
        LIMIT :limit
    """)
    suspend fun searchLikeFiltered(
        query: String,
        allowedSources: List<String>,
        limit: Int = 3
    ): List<KnowledgeItem>

    /**
     * FTS4 query returning KnowledgeItems where title, content, or keywords match the query string.
     */
    @Query("""
        SELECT knowledge_items.* FROM knowledge_items
        JOIN knowledge_fts ON knowledge_items.id = knowledge_fts.rowid
        WHERE knowledge_fts MATCH :ftsQuery
        ORDER BY knowledge_items.timestamp DESC
        LIMIT :limit
    """)
    suspend fun searchMatchingFts(ftsQuery: String, limit: Int = 3): List<KnowledgeItem>

    /**
     * Fallback query when FTS query string is plain text or partial match.
     */
    @Query("""
        SELECT * FROM knowledge_items
        WHERE title LIKE '%' || :query || '%'
           OR content LIKE '%' || :query || '%'
           OR keywords LIKE '%' || :query || '%'
        ORDER BY timestamp DESC
        LIMIT :limit
    """)
    suspend fun searchLike(query: String, limit: Int = 3): List<KnowledgeItem>

    /**
     * Queries recent comma-separated keyword strings from knowledge items.
     */
    @Query("SELECT keywords FROM knowledge_items WHERE keywords != '' ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentKeywordStrings(limit: Int = 50): List<String>

    /**
     * Returns up to 50 distinct, most recent core noun keywords from KnowledgeItem
     * to feed into SpeechRecognizer biasing (RecognizerIntent.EXTRA_BIASING_STRINGS).
     */
    @Transaction
    suspend fun getRecentBiasingKeywords(limit: Int = 50): List<String> {
        val keywordStrings = getRecentKeywordStrings(limit = 100)
        return keywordStrings
            .flatMap { it.split(",") }
            .map { it.trim() }
            .filter { it.length >= 2 }
            .distinct()
            .take(limit)
    }

    /**
     * Retrieves the top 3 most recent KnowledgeItem entries matching a list of extracted keywords,
     * filtered strictly by allowed source types (e.g. "EMAIL", "NEWS").
     */
    @Transaction
    suspend fun findTopMatchingByKeywordsFiltered(
        keywords: List<String>,
        allowedSources: List<String>,
        limit: Int = 3
    ): List<KnowledgeItem> {
        if (keywords.isEmpty() || allowedSources.isEmpty()) return emptyList()

        val cleanKeywords = keywords
            .map { it.trim().replace("\"", "").replace("'", "") }
            .filter { it.isNotBlank() }

        if (cleanKeywords.isEmpty()) return emptyList()

        val ftsQuery = cleanKeywords.joinToString(" OR ") { "\"$it\"*" }

        return try {
            val ftsResults = searchMatchingFtsFiltered(ftsQuery, allowedSources, limit)
            if (ftsResults.isNotEmpty()) {
                ftsResults
            } else {
                val fallbackResults = mutableListOf<KnowledgeItem>()
                for (keyword in cleanKeywords) {
                    val items = searchLikeFiltered(keyword, allowedSources, limit)
                    for (item in items) {
                        if (fallbackResults.none { it.id == item.id }) {
                            fallbackResults.add(item)
                        }
                        if (fallbackResults.size >= limit) break
                    }
                    if (fallbackResults.size >= limit) break
                }
                fallbackResults
            }
        } catch (e: Exception) {
            val fallbackResults = mutableListOf<KnowledgeItem>()
            for (keyword in cleanKeywords) {
                val items = searchLikeFiltered(keyword, allowedSources, limit)
                for (item in items) {
                    if (fallbackResults.none { it.id == item.id }) {
                        fallbackResults.add(item)
                    }
                    if (fallbackResults.size >= limit) break
                }
                if (fallbackResults.size >= limit) break
            }
            fallbackResults
        }
    }

    /**
     * Retrieves the top 3 most recent KnowledgeItem entries matching a list of extracted keywords.
     * Uses FTS search with fallback to keyword LIKE search.
     */
    @Transaction
    suspend fun findTopMatchingByKeywords(keywords: List<String>, limit: Int = 3): List<KnowledgeItem> {
        return findTopMatchingByKeywordsFiltered(keywords, listOf("EMAIL", "NEWS"), limit)
    }

    /**
     * Instant local search for Knowledge Base dashboard (Page 3).
     */
    @Query("""
        SELECT * FROM knowledge_items
        WHERE (:query = '' OR title LIKE '%' || :query || '%' OR content LIKE '%' || :query || '%' OR keywords LIKE '%' || :query || '%')
        ORDER BY timestamp DESC
    """)
    fun searchKnowledgeFlow(query: String): Flow<List<KnowledgeItem>>

    @Query("SELECT * FROM knowledge_items ORDER BY timestamp DESC")
    fun getAllFlow(): Flow<List<KnowledgeItem>>

    @Query("SELECT COUNT(*) FROM knowledge_items")
    fun getTotalCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM knowledge_items WHERE sourceType = 'EMAIL'")
    fun getEmailCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM knowledge_items WHERE sourceType = 'NEWS'")
    fun getNewsCountFlow(): Flow<Int>

    @Query("SELECT * FROM knowledge_items WHERE title = :title AND sourceType = :sourceType LIMIT 1")
    suspend fun findByTitleAndSource(title: String, sourceType: String): KnowledgeItem?

    @Query("SELECT EXISTS(SELECT 1 FROM knowledge_items WHERE title = :title AND sourceType = :sourceType)")
    suspend fun existsByTitleAndSource(title: String, sourceType: String): Boolean

    @Query("SELECT MAX(timestamp) FROM knowledge_items")
    fun getLastSyncTimestampFlow(): Flow<Long?>

    @Query("DELETE FROM knowledge_items WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM knowledge_items")
    suspend fun clearAll()
}
