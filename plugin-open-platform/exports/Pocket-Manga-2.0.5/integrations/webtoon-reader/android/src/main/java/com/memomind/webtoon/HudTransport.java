package com.memomind.webtoon;
import java.util.concurrent.CompletableFuture;

/** Completion means the final Scene tile was acknowledged by the receiver. */
public interface HudTransport {
    CompletableFuture<Receipt> present(byte[] gray4);
    final class Receipt {
        public final long frameId, milliseconds;
        public Receipt(long frameId, long milliseconds) { this.frameId = frameId; this.milliseconds = milliseconds; }
    }
}
