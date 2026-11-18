package com.assistant.realtimetip.data.util

import java.util.regex.Pattern

/**
 * Utility to strip HTML tags, script/style blocks, and decode entities
 * into clean, readable plain text.
 */
object HtmlSanitizer {

    private val SCRIPT_STYLE_PATTERN = Pattern.compile(
        "<(script|style)[^>]*?>.*?</\\1>",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val COMMENT_PATTERN = Pattern.compile(
        "<!--.*?-->",
        Pattern.DOTALL
    )

    private val BREAK_PATTERN = Pattern.compile(
        "<\\s*(br|p|div|tr|li|h[1-6])\\b[^>]*>",
        Pattern.CASE_INSENSITIVE
    )

    private val TAG_PATTERN = Pattern.compile(
        "<[^>]+>"
    )

    private val MULTI_NEWLINE_PATTERN = Pattern.compile(
        "\n{3,}"
    )

    private val MULTI_SPACE_PATTERN = Pattern.compile(
        "[ \t]+"
    )

    fun stripHtml(html: String?): String {
        if (html.isNullOrBlank()) return ""

        var text = html

        // 1. Remove script and style elements with their contents
        text = SCRIPT_STYLE_PATTERN.matcher(text).replaceAll(" ")

        // 2. Remove comments
        text = COMMENT_PATTERN.matcher(text).replaceAll(" ")

        // 3. Convert block/break elements to newlines
        text = BREAK_PATTERN.matcher(text).replaceAll("\n")

        // 4. Remove all remaining tags
        text = TAG_PATTERN.matcher(text).replaceAll(" ")

        // 5. Decode HTML entities
        text = decodeHtmlEntities(text)

        // 6. Normalize whitespace
        text = MULTI_SPACE_PATTERN.matcher(text).replaceAll(" ")
        text = MULTI_NEWLINE_PATTERN.matcher(text).replaceAll("\n\n")

        return text.trim()
    }

    private fun decodeHtmlEntities(input: String): String {
        var str = input
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&apos;", "'")
            .replace("&middot;", "·")
            .replace("&bull;", "•")
            .replace("&mdash;", "—")
            .replace("&ndash;", "–")

        // Decode decimal numeric entities: &#1234;
        val decPattern = Pattern.compile("&#([0-9]+);")
        val decMatcher = decPattern.matcher(str)
        val sbDec = StringBuffer()
        while (decMatcher.find()) {
            val codePoint = decMatcher.group(1)?.toIntOrNull() ?: 32
            val charStr = try {
                String(Character.toChars(codePoint))
            } catch (e: Exception) {
                " "
            }
            decMatcher.appendReplacement(sbDec, java.util.regex.Matcher.quoteReplacement(charStr))
        }
        decMatcher.appendTail(sbDec)
        str = sbDec.toString()

        // Decode hex numeric entities: &#x1f600;
        val hexPattern = Pattern.compile("&#x([0-9a-fA-F]+);")
        val hexMatcher = hexPattern.matcher(str)
        val sbHex = StringBuffer()
        while (hexMatcher.find()) {
            val codePoint = decMatcher.group(1)?.toIntOrNull(16) ?: 32
            val charStr = try {
                String(Character.toChars(codePoint))
            } catch (e: Exception) {
                " "
            }
            hexMatcher.appendReplacement(sbHex, java.util.regex.Matcher.quoteReplacement(charStr))
        }
        hexMatcher.appendTail(sbHex)

        return sbHex.toString()
    }
}
