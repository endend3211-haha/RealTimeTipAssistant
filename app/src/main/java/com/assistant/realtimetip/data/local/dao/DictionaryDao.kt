package com.assistant.realtimetip.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.assistant.realtimetip.data.local.entity.DictionaryEntry

@Dao
interface DictionaryDao {

    @Query("SELECT * FROM dictionary_cache WHERE word = :word COLLATE NOCASE LIMIT 1")
    suspend fun getDefinition(word: String): DictionaryEntry?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDefinition(entry: DictionaryEntry)

    @Query("DELETE FROM dictionary_cache WHERE timestamp < :expirationTimestamp")
    suspend fun deleteExpired(expirationTimestamp: Long)
}
