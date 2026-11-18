package com.assistant.realtimetip.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.assistant.realtimetip.data.local.entity.TipHistory
import kotlinx.coroutines.flow.Flow

@Dao
interface TipHistoryDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(tip: TipHistory): Long

    @Query("SELECT * FROM tip_history ORDER BY timestamp DESC")
    fun getAllTipsFlow(): Flow<List<TipHistory>>

    @Query("SELECT * FROM tip_history WHERE sourceType = :sourceType ORDER BY timestamp DESC")
    fun getTipsBySourceFlow(sourceType: String): Flow<List<TipHistory>>

    @Query("SELECT * FROM tip_history WHERE id = :id")
    suspend fun getTipById(id: Long): TipHistory?

    @Query("SELECT * FROM tip_history ORDER BY timestamp DESC LIMIT 1")
    fun getLatestTipFlow(): Flow<TipHistory?>

    @Query("DELETE FROM tip_history WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM tip_history")
    suspend fun clearAll()
}
