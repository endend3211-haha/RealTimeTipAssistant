package com.assistant.realtimetip.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Represents an indexed piece of knowledge gathered from personal emails or RSS news.
 */
@Entity(tableName = "knowledge_items")
data class KnowledgeItem(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    val id: Long = 0,

    @ColumnInfo(name = "sourceType")
    val sourceType: String, // "EMAIL" or "NEWS"

    @ColumnInfo(name = "title")
    val title: String,

    @ColumnInfo(name = "senderOrSource")
    val senderOrSource: String, // Email sender address / name, or News agency

    @ColumnInfo(name = "content")
    val content: String,

    @ColumnInfo(name = "keywords")
    val keywords: String, // Comma-separated core nouns (e.g., "스프링, 배포, 쿠버네티스")

    @ColumnInfo(name = "timestamp")
    val timestamp: Long = System.currentTimeMillis()
)
