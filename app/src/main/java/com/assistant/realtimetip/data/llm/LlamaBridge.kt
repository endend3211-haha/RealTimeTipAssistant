package com.assistant.realtimetip.data.llm

import android.util.Log

/**
 * Low-level JNI interface bridging to native llama.cpp compiled C++ library.
 */
class LlamaBridge {

    companion object {
        private const val TAG = "LlamaBridge"
        private var isLibraryLoaded = false

        init {
            try {
                System.loadLibrary("llama-bridge")
                isLibraryLoaded = true
                Log.i(TAG, "Native llama-bridge library loaded successfully.")
            } catch (e: UnsatisfiedLinkError) {
                Log.w(TAG, "Native library llama-bridge not found or failed to load: ${e.message}")
                isLibraryLoaded = false
            }
        }

        fun isNativeAvailable(): Boolean = isLibraryLoaded
    }

    private var nativeHandle: Long = 0

    val isLoaded: Boolean
        get() = nativeHandle != 0L && if (isLibraryLoaded) nativeIsModelLoaded(nativeHandle) else false

    fun initModel(modelPath: String, nThreads: Int, nCtx: Int, temperature: Float): Boolean {
        if (!isLibraryLoaded) {
            Log.w(TAG, "Native library is not loaded. Operating in fallback mode.")
            return false
        }

        freeModel()
        nativeHandle = nativeInit(modelPath, nThreads, nCtx, temperature)
        return nativeHandle != 0L
    }

    fun generate(prompt: String, maxTokens: Int = 512): String {
        if (nativeHandle == 0L || !isLibraryLoaded) {
            return ""
        }
        return nativeGenerate(nativeHandle, prompt, maxTokens)
    }

    /**
     * Executes constrained decoding using GBNF grammar or JSON schema,
     * strictly enforcing valid 1-line tip outputs or "NONE".
     */
    fun generateConstrained(prompt: String, grammar: String, maxTokens: Int = 48): String {
        if (nativeHandle == 0L || !isLibraryLoaded) {
            return ""
        }
        return nativeGenerateConstrained(nativeHandle, prompt, maxTokens, grammar)
    }

    /**
     * Preserves pinned prefix tokens (system prompt + topic) in KV cache,
     * while prefilling only new utterance tokens to achieve O(N) evaluation speed.
     */
    fun shiftKvCacheWithTopicPinning(pinnedTokens: Int, newTokens: Int): Boolean {
        if (nativeHandle == 0L || !isLibraryLoaded) {
            return false
        }
        return nativeShiftKvCacheWithTopicPinning(nativeHandle, pinnedTokens, newTokens)
    }

    fun freeModel() {
        if (nativeHandle != 0L) {
            if (isLibraryLoaded) {
                nativeFree(nativeHandle)
            }
            nativeHandle = 0L
        }
    }

    // --- Native JNI declarations ---
    private external fun nativeInit(modelPath: String, nThreads: Int, nCtx: Int, temperature: Float): Long
    private external fun nativeGenerate(handle: Long, prompt: String, maxTokens: Int): String
    private external fun nativeGenerateConstrained(handle: Long, prompt: String, maxTokens: Int, grammar: String): String
    private external fun nativeShiftKvCacheWithTopicPinning(handle: Long, pinnedTokens: Int, newTokens: Int): Boolean
    private external fun nativeFree(handle: Long)
    private external fun nativeIsModelLoaded(handle: Long): Boolean
}
