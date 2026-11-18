package com.memomind.webtoon;
import android.app.Activity;
import android.graphics.Bitmap;
import android.os.*;
import android.webkit.*;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** Attach BEFORE loading only the trusted Pocket/Webtoon PhoneSDK page.
 * The host must block navigation and subframes to untrusted content in that
 * plugin WebView. The separate official-site reader has no JS bridge. */
public final class WebtoonRuntime implements AutoCloseable {
    private final MangaDexGateway manga=new MangaDexGateway();
    @JavascriptInterface public void mangaRequest(String message){if(closed||message==null||message.length()>8192)return;main.post(()->{if(!transport.isTrusted())return;io.submit(()->{JSONObject response=new JSONObject();try{JSONObject request=new JSONObject(message);response.put("requestId",request.getString("requestId"));String operation=request.getString("operation"),value=request.getString("value");if("json".equals(operation))response.put("data",manga.json(value));else if("image".equals(operation))response.put("image",manga.image(value));else throw new IllegalArgumentException("지원하지 않는 요청");response.put("ok",true);}catch(Exception error){try{response.put("ok",false);response.put("error",error.getMessage());}catch(JSONException ignored){}}emit("memo-mangadex-response",response);});});}
    private final Activity activity;private final WebView plugin;private final WebViewSceneTransport transport;
    private final WebtoonApi api=new WebtoonApi();private final Handler main=new Handler(Looper.getMainLooper());private final ExecutorService io=Executors.newFixedThreadPool(2);private final AtomicLong selection=new AtomicLong();
    private Future<?> listRequest;private ReaderOverlay reader;private volatile boolean closed;
    public WebtoonRuntime(Activity activity,WebView plugin,String trustedPluginUrl){this.activity=activity;this.plugin=plugin;transport=new WebViewSceneTransport(plugin,trustedPluginUrl);plugin.addJavascriptInterface(this,"MemoWebtoonHost");}
    @JavascriptInterface public void requestList(String message){if(closed||message==null||message.length()>8192)return;main.post(()->{if(!transport.isTrusted())return;if(listRequest!=null)listRequest.cancel(true);listRequest=io.submit(()->{JSONObject response=new JSONObject();try{JSONObject request=new JSONObject(message);response.put("requestId",request.getLong("requestId"));response.put("data",api.list(request.optString("base",WebtoonApi.DEFAULT_BASE),request.getJSONObject("query")));response.put("ok",true);}catch(Exception error){try{response.put("ok",false);response.put("error","웹툰 API 연결에 실패했습니다. 서버 주소와 네트워크를 확인해 주세요. "+error.getMessage());}catch(JSONException ignored){}}emit("memo-webtoon-result",response);});});}
    @JavascriptInterface public void previewTitle(String message){if(closed||message==null||message.length()>16384)return;final long revision=selection.incrementAndGet();main.post(()->{if(!transport.isTrusted()||reader!=null)return;io.submit(()->{try{JSONObject item=new JSONObject(message);Bitmap cover=null;try{cover=api.cover(item);}catch(Exception ignored){}byte[] frame=HudRenderer.title(item,cover);if(!closed&&selection.get()==revision)transport.present(frame);}catch(Exception ignored){}});});}
    @JavascriptInterface public void openReader(String message){if(closed||message==null||message.length()>16384)return;selection.incrementAndGet();main.post(()->{if(!transport.isTrusted())return;try{JSONObject item=new JSONObject(message);String url=item.getString("url");if(reader!=null){reader.close();reader=null;}reader=new ReaderOverlay(activity,url,transport,()->{reader=null;emit("memo-webtoon-reader-state",jsonState(false,null));});emit("memo-webtoon-reader-state",jsonState(true,null));}catch(Exception error){emit("memo-webtoon-reader-state",jsonState(false,"공식 웹툰 주소를 열 수 없습니다. "+error.getMessage()));}});}
    @JavascriptInterface public void readerCommand(String command){if(closed)return;main.post(()->{if(!transport.isTrusted()||reader==null)return;if("nextUnread".equals(command))reader.nextUnread();else if("next".equals(command))reader.nextUnread();else if("previous".equals(command))reader.previous();else if("close".equals(command))reader.close();});}
    @JavascriptInterface public void requestMangaDetail(String message){if(closed||message==null||message.length()>4096)return;main.post(()->{if(!transport.isTrusted())return;io.submit(()->{JSONObject result=new JSONObject();try{JSONObject request=new JSONObject(message);result.put("id",request.getLong("id"));result.put("data",api.mangaDetail(request.getString("base"),request.getLong("id")));result.put("ok",true);}catch(Exception error){try{result.put("ok",false);}catch(Exception ignored){}}emit("memo-webtoon-detail",result);});});}
    private JSONObject jsonState(boolean open,String error){JSONObject data=new JSONObject();try{data.put("open",open);if(error!=null)data.put("error",error);}catch(JSONException ignored){}return data;}
    private void emit(String name,JSONObject data){String quoted=JSONObject.quote(data.toString()).replace("\u2028","\\u2028").replace("\u2029","\\u2029");main.post(()->{if(!closed&&transport.isTrusted())plugin.evaluateJavascript("window.dispatchEvent(new CustomEvent('"+name+"',{detail:JSON.parse("+quoted+")}))",null);});}
    public void onPause(){if(reader!=null)reader.setSuspended(true);}
    public void onResume(){if(reader!=null)reader.setSuspended(false);}
    public boolean onBackPressed(){return reader!=null&&reader.back();}
    @Override public void close(){closed=true;selection.incrementAndGet();if(reader!=null)reader.close();plugin.removeJavascriptInterface("MemoWebtoonHost");transport.close();io.shutdownNow();main.removeCallbacksAndMessages(null);}
}
