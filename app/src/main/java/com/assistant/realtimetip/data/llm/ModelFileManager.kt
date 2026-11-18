package com.assistant.realtimetip.data.llm

import android.content.Context
import android.os.Environment
import android.util.Log
import java.io.File
import java.text.DecimalFormat

data class ModelFile(
    val name: String,
    val path: String,
    val sizeFormatted: String,
    val sizeBytes: Long,
    val lastModified: Long,
    val exists: Boolean
)

data class AppMemoryUsage(
    val usedRamMb: Long,
    val freeRamMb: Long,
    val totalRamMb: Long,
    val maxHeapMb: Long
)

/**
 * Handles discovery of local GGUF model files in storage and measures system RAM usage.
 */
object ModelFileManager {

    private const val TAG = "ModelFileManager"
    const val DEFAULT_MODEL_DIR_PATH = "/storage/emulated/0/Download/ai"
    const val DEFAULT_MODEL_NAME = "EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf"
    const val DEFAULT_MODEL_PATH = "$DEFAULT_MODEL_DIR_PATH/$DEFAULT_MODEL_NAME"

    /**
     * Returns the designated primary AI model folder (e.g. Android/data/.../files/ai or Downloads/ai).
     * Ensures the directory is created if missing.
     */
    fun getDesignatedAiDir(context: Context?): File {
        val appAiDir = context?.getExternalFilesDir("ai")
        if (appAiDir != null) {
            if (!appAiDir.exists()) appAiDir.mkdirs()
            return appAiDir
        }
        val downloadAi = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ai")
        if (!downloadAi.exists()) downloadAi.mkdirs()
        return downloadAi
    }

    /**
     * Scans the designated `ai` folder, external files, and Download directories for all `.gguf` files.
     */
    fun scanAvailableGgufModels(context: Context? = null): List<ModelFile> {
        val models = mutableListOf<ModelFile>()
        val primaryAiDir = getDesignatedAiDir(context)

        val searchedDirs = mutableListOf<File>()
        searchedDirs.add(primaryAiDir)

        context?.filesDir?.resolve("ai")?.let { searchedDirs.add(it) }
        searchedDirs.add(File(DEFAULT_MODEL_DIR_PATH))
        searchedDirs.add(File("/storage/emulated/0/Download/AI"))
        searchedDirs.add(File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ai"))
        searchedDirs.add(File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AI"))
        searchedDirs.add(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS))

        val seenPaths = mutableSetOf<String>()

        for (dir in searchedDirs) {
            try {
                if (dir.exists() && dir.isDirectory) {
                    dir.listFiles { file ->
                        file.isFile && file.name.endsWith(".gguf", ignoreCase = true)
                    }?.forEach { file ->
                        if (seenPaths.add(file.absolutePath)) {
                            models.add(createModelFile(file))
                            Log.d(TAG, "Discovered GGUF model: ${file.name} at ${file.absolutePath}")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to scan directory: ${dir.absolutePath}", e)
            }
        }

        // Ensure default EXAONE model entry exists as template if no models found on disk yet
        if (models.none { it.path == DEFAULT_MODEL_PATH || it.name == DEFAULT_MODEL_NAME }) {
            val defaultFile = File(DEFAULT_MODEL_PATH)
            models.add(
                0,
                ModelFile(
                    name = DEFAULT_MODEL_NAME,
                    path = DEFAULT_MODEL_PATH,
                    sizeFormatted = if (defaultFile.exists()) formatFileSize(defaultFile.length()) else "2.4 GB (대기)",
                    sizeBytes = if (defaultFile.exists()) defaultFile.length() else 2576980377L,
                    lastModified = if (defaultFile.exists()) defaultFile.lastModified() else System.currentTimeMillis(),
                    exists = defaultFile.exists()
                )
            )
        }

        return models.sortedWith(compareByDescending<ModelFile> { it.exists }.thenBy { it.name })
    }

    private fun createModelFile(file: File): ModelFile {
        return ModelFile(
            name = file.name,
            path = file.absolutePath,
            sizeFormatted = formatFileSize(file.length()),
            sizeBytes = file.length(),
            lastModified = file.lastModified(),
            exists = true
        )
    }

    private fun formatFileSize(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB", "TB")
        val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
        val format = DecimalFormat("#,##0.#")
        return "${format.format(bytes / Math.pow(1024.0, digitGroups.toDouble()))} ${units[digitGroups]}"
    }

    /**
     * Reads current App RAM and heap usage in Megabytes.
     */
    fun getAppMemoryUsage(): AppMemoryUsage {
        val runtime = Runtime.getRuntime()
        val totalMem = runtime.totalMemory()
        val freeMem = runtime.freeMemory()
        val usedMem = totalMem - freeMem
        val maxMem = runtime.maxMemory()

        val mb = 1024L * 1024L
        return AppMemoryUsage(
            usedRamMb = usedMem / mb,
            freeRamMb = freeMem / mb,
            totalRamMb = totalMem / mb,
            maxHeapMb = maxMem / mb
        )
    }
}
