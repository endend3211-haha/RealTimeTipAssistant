package com.assistant.realtimetip.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Fts4

/**
 * FTS4 virtual table for fast full-text search indexing on KnowledgeItem.
 * Mirrors title, content, and keywords for high-speed keyword lookups.
 */
@Entity(tableName = "knowledge_fts")
@Fts4(contentEntity = KnowledgeItem::class)
data class KnowledgeItemFts(
    @ColumnInfo(name = "title")
    val title: String,

    @ColumnInfo(name = "content")
    val content: String,

    @ColumnInfo(name = "keywords")
    val keywords: String
)
