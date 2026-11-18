package com.memomind.webtoon;

/** Host GRAY_4: left pixel in the high nibble; no color/JPEG crosses BLE. */
public final class Gray4 {
    private Gray4() {}
    public static byte[] pack(int[] argb) {
        if ((argb.length & 1) != 0) throw new IllegalArgumentException("짝수 픽셀 수가 필요합니다.");
        byte[] packed = new byte[argb.length / 2];
        for (int i = 0; i < argb.length; i++) {
            int p = argb[i];
            int gray = (299 * ((p >>> 16) & 255) + 587 * ((p >>> 8) & 255) + 114 * (p & 255) + 8500) / 17000;
            packed[i / 2] |= (byte)(Math.min(15, gray) << ((i & 1) == 0 ? 4 : 0));
        }
        return packed;
    }
}
