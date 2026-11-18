package com.assistant.realtimetip.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached dictionary definition entry for fast on-device repeat lookup.
 */
@Entity(tableName = "dictionary_cache")
data class DictionaryEntry(
    @PrimaryKey
    val word: String,
    val definition: String,
    val language: String, // "ko" or "en"
    val timestamp: Long = System.currentTimeMillis()
)
