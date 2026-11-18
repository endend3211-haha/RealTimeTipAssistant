package com.memomind.geminibridge;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.os.*;
import java.util.List;
import org.json.JSONObject;

public class GeminiAccessibilityService extends AccessibilityService {
    private static volatile boolean connected;
    private static String answer = "";
    private static long sequence;
    private static long updatedAt;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable scan = this::readAnswer;
    static synchronized void clearAnswer() {
        if (!answer.isEmpty()) { answer = ""; sequence++; }
        updatedAt = 0;
    }
    static synchronized String snapshot() {
        if (System.currentTimeMillis() - updatedAt > 120000) clearAnswer();
        try {
            return new JSONObject().put("ok", true).put("bridge", "memomind-gemini-v1")
                .put("accessibility", connected).put("sequence", sequence)
                .put("updatedAt", updatedAt).put("text", answer).toString();
        } catch (org.json.JSONException e) { return "{}"; }
    }
    @Override protected void onServiceConnected() { connected = true; }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!BridgeService.active) { clearAnswer(); return; }
        CharSequence pkg = event.getPackageName();
        if (pkg == null || !allowed(pkg.toString())) return;
        handler.removeCallbacks(scan);
        handler.postDelayed(scan, 500);
    }
    private boolean allowed(String pkg) {
        return pkg.equals("com.google.android.googlequicksearchbox") || pkg.equals("com.google.android.apps.bard");
    }
    private void readAnswer() {
        if (!BridgeService.active) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        try {
            if (root.getPackageName() == null || !allowed(root.getPackageName().toString())) return;
            // Verified against this phone. Never scrape all visible text or input fields.
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(
                "com.google.android.googlequicksearchbox:id/assistant_robin_text");
            String found = "";
            for (AccessibilityNodeInfo node : nodes) {
                try {
                    if (!node.isPassword() && !node.isEditable() && node.isVisibleToUser()
                        && node.getText() != null) found = node.getText().toString().trim();
                } finally { node.recycle(); }
            }
            if (found.isEmpty()) return;
            int end = found.offsetByCodePoints(0, Math.min(found.codePointCount(0, found.length()), 4000));
            found = found.substring(0, end);
            synchronized (GeminiAccessibilityService.class) {
                if (!found.equals(answer)) { answer = found; sequence++; }
                updatedAt = System.currentTimeMillis();
            }
        } finally { root.recycle(); }
    }
    @Override public void onInterrupt() { clearAnswer(); }
    @Override public void onDestroy() {
        connected = false;
        handler.removeCallbacks(scan);
        clearAnswer();
        super.onDestroy();
    }
}
