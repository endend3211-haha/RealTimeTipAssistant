package com.memomind.webtoon;
import org.junit.Test;
import static org.junit.Assert.*;
public class MangaDexGatewayTest {
 @Test public void onlyDocumentedApiPathsAreAllowed(){
  assertTrue(MangaDexGateway.validPath("/manga?limit=7&title=test"));
  assertTrue(MangaDexGateway.validPath("/at-home/server/00000000-0000-4000-8000-000000000001"));
  assertFalse(MangaDexGateway.validPath("https://other.test/manga"));
  assertFalse(MangaDexGateway.validPath("//other.test/manga"));
  assertFalse(MangaDexGateway.validPath("/manga/../../admin"));
  assertFalse(MangaDexGateway.validPath("/manga?x=\r\nHost:other"));
 }
}
