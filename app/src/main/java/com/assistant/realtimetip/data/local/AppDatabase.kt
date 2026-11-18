package com.assistant.realtimetip.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.assistant.realtimetip.data.local.dao.ConversationLogDao
import com.assistant.realtimetip.data.local.dao.DictionaryDao
import com.assistant.realtimetip.data.local.dao.KnowledgeDao
import com.assistant.realtimetip.data.local.dao.TipHistoryDao
import com.assistant.realtimetip.data.local.entity.ConversationLog
import com.assistant.realtimetip.data.local.entity.DictionaryEntry
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import com.assistant.realtimetip.data.local.entity.KnowledgeItemFts
import com.assistant.realtimetip.data.local.entity.TipHistory

@Database(
    entities = [
        KnowledgeItem::class,
        KnowledgeItemFts::class,
        ConversationLog::class,
        TipHistory::class,
        DictionaryEntry::class
    ],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun knowledgeDao(): KnowledgeDao
    abstract fun conversationLogDao(): ConversationLogDao
    abstract fun tipHistoryDao(): TipHistoryDao
    abstract fun dictionaryDao(): DictionaryDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "realtime_tip_assistant.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
