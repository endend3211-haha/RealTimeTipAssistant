package com.assistant.realtimetip.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Historical record of generated actionable 1-3 line tips, including the
 * triggering conversational text and the referenced knowledge excerpt.
 */
@Entity(tableName = "tip_history")
data class TipHistory(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    val id: Long = 0,

    @ColumnInfo(name = "triggerText")
    val triggerText: String,

    @ColumnInfo(name = "generatedTip")
    val generatedTip: String,

    @ColumnInfo(name = "referenceTitle")
    val referenceTitle: String,

    @ColumnInfo(name = "referenceContent")
    val referenceContent: String,

    @ColumnInfo(name = "sourceType")
    val sourceType: String, // "EMAIL" or "NEWS"

    @ColumnInfo(name = "timestamp")
    val timestamp: Long = System.currentTimeMillis()
)
