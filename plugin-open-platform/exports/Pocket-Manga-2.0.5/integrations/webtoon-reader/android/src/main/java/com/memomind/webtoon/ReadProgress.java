package com.memomind.webtoon;

/** One page = one HUD viewport, with overlap. Only ACKed views become read. */
public final class ReadProgress {
    private double furthest;
    public ReadProgress(double restored) { furthest = Math.max(0, Double.isFinite(restored) ? restored : 0); }
    public synchronized void acknowledge(double top) { if (Double.isFinite(top)) furthest = Math.max(furthest, Math.max(0, top)); }
    public synchronized double furthest() { return furthest; }
    public synchronized double nextUnread(double current, double step) {
        if (!Double.isFinite(current) || !Double.isFinite(step) || step <= 0) throw new IllegalArgumentException("읽기 영역을 확인해 주세요.");
        return Math.max(Math.max(0, current), furthest) + step;
    }
}
