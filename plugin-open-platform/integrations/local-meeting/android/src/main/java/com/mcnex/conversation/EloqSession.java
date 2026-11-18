package com.mcnex.conversation;

import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.*;

final class EloqSession implements AutoCloseable {
    private final android.content.Context context;
    private final File model;
    private final ExecutorService inference = Executors.newSingleThreadExecutor();
    private final JSONArray lines = new JSONArray();
    private JSONObject cue;
    private NativeKoreanSpeech speech;
    private ContinuousOpus decoder;
    private LocalAi ai;
    private int seq, generation;
    private boolean running, cuePending;
    private long lastCue;
    private String partial = "";

    EloqSession(android.content.Context context, File model) {
        this.context = context.getApplicationContext();
        this.model = model;
    }

    JSONObject call(String method, String target, byte[] body) throws Exception {
        String[] url = target.split("\\?", 2);
        switch (method + " " + url[0]) {
            case "GET /eloq/health": case "GET /eloq/state": return state();
            case "POST /eloq/config": case "POST /eloq/mode": return state();
            case "POST /eloq/start":
                if (url.length == 2 && url[1].contains("mic=1")) throw new IOException("안경 마이크를 사용하도록 휴대폰 마이크 옵션을 꺼 주세요.");
                start(); return state();
            case "POST /eloq/audio":
                if (decoder == null) throw new IOException("먼저 청취를 시작하세요.");
                decoder.accept(convert(body)); return state();
            case "POST /eloq/stop":
                stop(true); return state();
            case "POST /eloq/summary":
                String text;
                synchronized(this) { text = transcript(); }
                if (text.isBlank()) throw new IOException("요약할 대화가 없습니다.");
                return inference.submit(() -> infer(text, false)).get(175, TimeUnit.SECONDS);
            default: throw new IOException("지원하지 않는 요청입니다.");
        }
    }

    private void start() throws Exception {
        stop(false);
        synchronized(this) {
            generation++; seq = 0; while (lines.length() > 0) lines.remove(0);
            cue = null; partial = ""; lastCue = 0; cuePending = false; running = true;
        }
        try {
            speech = new NativeKoreanSpeech(context, new NativeKoreanSpeech.TextSink() {
                public void partial(String id, String text) { synchronized(EloqSession.this) { partial = text; } }
                public void confirmed(String id, String text) { confirm(text); }
            });
            decoder = new ContinuousOpus(speech);
        } catch (Exception error) { stop(false); throw error; }
    }

    private synchronized void confirm(String text) {
        lines.put(object("seq", ++seq, "text", text));
        if (lines.length() > 60) lines.remove(0);
        partial = "";
        long now = android.os.SystemClock.elapsedRealtime();
        if (!running || cuePending || !model.isFile() || (lastCue > 0 && now - lastCue < 12000)) return;
        lastCue = now; cuePending = true;
        int session = generation;
        String recent = transcript();
        inference.execute(() -> {
            try {
                JSONObject result = infer(recent.substring(Math.max(0, recent.length()-650)), true);
                synchronized(this) {
                    if (generation == session && running)
                        cue = object("seq", ++seq, "text", result.optString("summary"), "via", "Gemma 2", "ms", result.optLong("ms"), "kind", "tip");
                }
            } catch (Exception | LinkageError error) {
                android.util.Log.w("MemoLocalMeeting", "Local cue failed", error);
            } finally {
                synchronized(this) { if (generation == session) cuePending = false; }
            }
        });
    }

    private JSONObject infer(String text, boolean live) throws Exception {
        if (ai == null) ai = new LocalAi(model);
        long start = android.os.SystemClock.elapsedRealtime();
        String prompt = live ? "최근 대화에서 가장 중요한 내용을 짧은 한국어 한 문장으로 알려주세요."
                : "대화의 핵심과 결정 사항을 한국어로 간결하게 요약하세요. 원문에 없는 내용은 추가하지 마세요.";
        String result = ai.minutes(prompt, text, live ? 40 : 120);
        if (result.isBlank()) throw new IOException("Gemma 응답이 비어 있습니다.");
        return object("ok", true, "summary", result, "via", "Gemma 2", "ms", android.os.SystemClock.elapsedRealtime()-start);
    }

    private String transcript() {
        StringBuilder text = new StringBuilder();
        for (int i=0;i<lines.length();i++) text.append(lines.optJSONObject(i).optString("text")).append(' ');
        String result = text.toString().trim();
        return result.substring(Math.max(0,result.length()-3000));
    }

    private synchronized JSONObject state() throws JSONException {
        JSONArray cues = new JSONArray();
        if (cue != null) cues.put(cue);
        return object("ok", true, "version", "1.2.0 Local", "loaded", true, "hasFastKey", model.isFile(),
                "hasCarefulKey", model.isFile(), "running", running, "mic", false, "seq", seq,
                "partial", partial, "lines", new JSONArray(lines.toString()), "cues", cues);
    }

    private void stop(boolean flush) {
        synchronized(this) { running = false; }
        if (decoder != null) {
            try { if (flush) decoder.finish(); } catch (Exception ignored) { }
            finally { decoder.close(); decoder = null; }
        }
        if (speech != null) {
            if (flush) {
                long end = android.os.SystemClock.elapsedRealtime() + 1400;
                while (android.os.SystemClock.elapsedRealtime() < end) {
                    try { if (!speech.snapshot().optBoolean("running")) break; Thread.sleep(40); }
                    catch (Exception ignored) { break; }
                }
            }
            speech.close(); speech = null;
        }
    }

    static byte[] convert(byte[] body) throws IOException {
        if (body.length < 4) throw new IOException("오디오 헤더가 짧습니다.");
        ByteBuffer header = ByteBuffer.wrap(body).order(ByteOrder.LITTLE_ENDIAN);
        int count = Short.toUnsignedInt(header.getShort());
        if (count < 1 || count > 500 || body.length < 2 + count*2) throw new IOException("오디오 프레임 수 오류");
        int offset = 2 + count*2;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        DataOutputStream packets = new DataOutputStream(output);
        packets.writeInt(count);
        for (int i=0;i<count;i++) {
            int n = Short.toUnsignedInt(header.getShort());
            if (n < 1 || n > 1275 || n > body.length-offset) throw new IOException("Opus 길이 오류");
            packets.writeShort(n); packets.write(body,offset,n); offset+=n;
        }
        if (offset != body.length) throw new IOException("오디오 데이터 길이 오류");
        return output.toByteArray();
    }

    private static JSONObject object(Object... values) {
        JSONObject result = new JSONObject();
        try { for(int i=0;i<values.length;i+=2) result.put((String)values[i],values[i+1]); }
        catch (JSONException error) { throw new IllegalStateException(error); }
        return result;
    }

    @Override public void close() {
        stop(false);
        inference.execute(() -> { if (ai != null) ai.close(); });
        inference.shutdown();
    }
}
