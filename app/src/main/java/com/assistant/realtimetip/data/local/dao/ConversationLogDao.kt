package com.assistant.realtimetip.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.assistant.realtimetip.data.local.entity.ConversationLog
import kotlinx.coroutines.flow.Flow

@Dao
interface ConversationLogDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(log: ConversationLog): Long

    @Query("SELECT * FROM conversation_logs ORDER BY timestamp DESC LIMIT :limit")
    fun getRecentLogsFlow(limit: Int = 20): Flow<List<ConversationLog>>

    @Query("SELECT * FROM conversation_logs ORDER BY timestamp DESC LIMIT 1")
    fun getLatestLogFlow(): Flow<ConversationLog?>

    @Query("SELECT * FROM conversation_logs ORDER BY timestamp DESC")
    fun getAllLogsFlow(): Flow<List<ConversationLog>>

    @Query("DELETE FROM conversation_logs")
    suspend fun clearAll()
}
