package com.assistant.realtimetip.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Stores real-time speech-to-text recognition logs, preserving both the raw
 * transcript and the phonetically/custom-dictionary corrected text.
 */
@Entity(tableName = "conversation_logs")
data class ConversationLog(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    val id: Long = 0,

    @ColumnInfo(name = "rawText")
    val rawText: String,

    @ColumnInfo(name = "correctedText")
    val correctedText: String,

    @ColumnInfo(name = "timestamp")
    val timestamp: Long = System.currentTimeMillis()
)
