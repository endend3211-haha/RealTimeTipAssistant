package com.assistant.realtimetip.data.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.assistant.realtimetip.data.llm.ModelFileManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map

val Context.llmDataStore: DataStore<Preferences> by preferencesDataStore(name = "llm_model_preferences")

/**
 * Manages persistence of selected GGUF model paths using AndroidX DataStore (Preferences).
 */
class LlmModelDataStore(private val context: Context) {

    companion object {
        val KEY_SELECTED_MODEL_PATH = stringPreferencesKey("selected_model_path")
    }

    val selectedModelPathFlow: Flow<String> = context.llmDataStore.data.map { preferences ->
        preferences[KEY_SELECTED_MODEL_PATH] ?: ModelFileManager.DEFAULT_MODEL_PATH
    }

    suspend fun getSelectedModelPath(): String {
        return context.llmDataStore.data.firstOrNull()?.get(KEY_SELECTED_MODEL_PATH)
            ?: ModelFileManager.DEFAULT_MODEL_PATH
    }

    suspend fun saveSelectedModelPath(path: String) {
        context.llmDataStore.edit { preferences ->
            preferences[KEY_SELECTED_MODEL_PATH] = path.trim()
        }
    }
}
