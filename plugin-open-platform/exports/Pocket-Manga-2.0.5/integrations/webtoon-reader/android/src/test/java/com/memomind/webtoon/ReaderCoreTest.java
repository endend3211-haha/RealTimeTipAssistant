package com.memomind.webtoon;
import org.junit.Test;
import static org.junit.Assert.*;
public class ReaderCoreTest {
 @Test public void gray4NibbleOrderAndSize(){assertArrayEquals(new byte[]{(byte)0xf0,0x2a},Gray4.pack(new int[]{0xffffffff,0xff000000,0xff222222,0xffaaaaaa}));assertEquals(105000,Gray4.pack(new int[600*350]).length);}
 @Test public void previousPageNeverLosesReadProgress(){ReadProgress progress=new ReadProgress(0);progress.acknowledge(300);progress.acknowledge(600);progress.acknowledge(0);assertEquals(600,progress.furthest(),0);assertEquals(900,progress.nextUnread(0,300),0);assertEquals(1200,progress.nextUnread(900,300),0);}
 @Test public void restoredProgressAndUnacknowledgedPage(){ReadProgress progress=new ReadProgress(450);assertEquals(750,progress.nextUnread(150,300),0);assertEquals(450,progress.furthest(),0);progress.acknowledge(Double.NaN);assertEquals(450,progress.furthest(),0);}
}
