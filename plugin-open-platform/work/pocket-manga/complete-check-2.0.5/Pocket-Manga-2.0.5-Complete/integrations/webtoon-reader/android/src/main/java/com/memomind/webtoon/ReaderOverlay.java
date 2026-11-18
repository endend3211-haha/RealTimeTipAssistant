package com.memomind.webtoon;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.*;
import android.os.*;
import android.view.*;
import android.view.animation.DecelerateInterpolator;
import android.webkit.*;
import android.widget.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Full-screen phone reader. Glasses receive only the outlined reading region,
 * without phone toolbars. This WebView has NO JavascriptInterface attached. */
public final class ReaderOverlay implements AutoCloseable {
    private final Activity activity; private final HudTransport transport; private final Runnable onClose;
    private final ViewGroup decor; private final View root; private final WebView web; private final TextView status; private final View guide;
    private final Handler main = new Handler(Looper.getMainLooper()); private final SharedPreferences preferences;
    private boolean closed, suspended, paused, busy, scheduled, dirty, programmatic;
    private int failures, oldUiVisibility; private long lastStarted; private double cursorCss;
    private String chapter = "", progressKey = ""; private ReadProgress progress = new ReadProgress(0); private ValueAnimator animator;
    private final Runnable save = this::saveProgress;
    public ReaderOverlay(Activity activity, String url, HudTransport transport, Runnable onClose) {
        if (!isOfficial(url)) throw new IllegalArgumentException("공식 웹툰 HTTPS 주소가 필요합니다.");
        this.activity=activity;this.transport=transport;this.onClose=onClose;
        preferences=activity.getSharedPreferences("webtoon_read_progress",Activity.MODE_PRIVATE);
        decor=(ViewGroup)activity.getWindow().getDecorView();oldUiVisibility=decor.getSystemUiVisibility();
        root=LayoutInflater.from(activity).inflate(R.layout.webtoon_reader,decor,false);decor.addView(root,new ViewGroup.LayoutParams(-1,-1));
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        web=root.findViewById(R.id.reader_web);status=root.findViewById(R.id.reader_status);
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setBuiltInZoomControls(true);web.getSettings().setDisplayZoomControls(false);web.getSettings().setSupportZoom(true);
        web.getSettings().setUseWideViewPort(true);web.getSettings().setLoadWithOverviewMode(true);
        guide=new View(activity){final Paint paint=new Paint();@Override protected void onDraw(Canvas canvas){Rect crop=cropLocal();paint.setStyle(Paint.Style.STROKE);paint.setColor(0xffb7e493);paint.setStrokeWidth(3);canvas.drawRect(crop,paint);}};
        ((FrameLayout)root.findViewById(R.id.reader_surface)).addView(guide,new FrameLayout.LayoutParams(-1,-1));
        guide.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(!request.isForMainFrame())return false;if(isOfficial(request.getUrl().toString()))return false;status.setText("공식 사이트 안에서 읽어 주세요. 외부 앱 주소는 열지 않습니다.");return true;}
            @Override public void onPageStarted(WebView view,String address,Bitmap favicon){switchChapter(address);status.setText("공식 웹툰을 불러오는 중입니다.");}
            @Override public void doUpdateVisitedHistory(WebView view,String address,boolean reload){switchChapter(address);}
            @Override public void onPageFinished(WebView view,String address){if(closed)return;switchChapter(address);cursorCss=Math.min(progress.furthest(),maxTopCss());web.scrollTo(0,(int)(cursorCss*scale()));markDirty();main.postDelayed(()->{if(!closed)markDirty();},500);main.postDelayed(()->{if(!closed)markDirty();},1200);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())status.setText("페이지를 불러오지 못했습니다. 연결 또는 공식 사이트 접근 상태를 확인해 주세요.");}
        });
        web.setWebChromeClient(new WebChromeClient(){@Override public void onProgressChanged(WebView view,int value){if(value==100&&!closed)markDirty();}});
        web.setOnTouchListener((view,event)->{if(event.getActionMasked()==MotionEvent.ACTION_DOWN){if(animator!=null)animator.cancel();programmatic=false;cursorCss=web.getScrollY()/scale();}return false;});
        web.setOnScrollChangeListener((View.OnScrollChangeListener)(view,x,y,oldX,oldY)->{if(!programmatic)cursorCss=y/scale();guide.invalidate();markDirty();});
        root.findViewById(R.id.reader_close).setOnClickListener(v->close());root.findViewById(R.id.reader_previous).setOnClickListener(v->previous());root.findViewById(R.id.reader_next).setOnClickListener(v->nextUnread());
        Button sync=root.findViewById(R.id.reader_sync);sync.setOnClickListener(v->{paused=!paused;sync.setText(paused?"전송 켜기":"전송 끄기");failures=0;if(!paused)markDirty();});
        web.loadUrl(url);
    }
    public static boolean isOfficial(String address){try{android.net.Uri uri=android.net.Uri.parse(address);String host=uri.getHost();if(!"https".equals(uri.getScheme())||uri.getUserInfo()!=null||host==null)return false;return host.equals("comic.naver.com")||host.equals("m.comic.naver.com")||host.equals("series.naver.com")||host.equals("nid.naver.com")||host.equals("webtoon.kakao.com")||host.equals("page.kakao.com")||host.equals("accounts.kakao.com")||host.equals("kauth.kakao.com");}catch(Exception error){return false;}}
    private float scale(){return Math.max(.1f,web.getScale());}
    private int cropHeight(){return Math.min(web.getHeight(),Math.round(web.getWidth()*350f/600));}
    private double maxTopCss(){return Math.max(0,web.getContentHeight()-cropHeight()/scale());}
    private Rect cropLocal(){int h=Math.max(1,cropHeight()),w=Math.min(web.getWidth(),Math.round(h*600f/350));int x=Math.max(0,(web.getWidth()-w)/2),y=Math.max(0,Math.min(Math.max(0,web.getHeight()-h),(int)(cursorCss*scale())-web.getScrollY()));return new Rect(x,y,x+w,y+h);}
    private double stepCss(){return Math.max(1,(cropHeight()-web.getWidth()*50d/600)/scale());}
    public void nextUnread(){if(closed)return;double next=Math.min(maxTopCss(),progress.nextUnread(cursorCss,stepCss()));if(next<=cursorCss+.5){status.setText("현재 회차의 마지막 읽기 영역입니다. 다음 회차는 공식 페이지에서 선택해 주세요.");return;}moveTo(next);}
    public void previous(){if(!closed)moveTo(Math.max(0,cursorCss-stepCss()));}
    private void moveTo(double target){if(animator!=null)animator.cancel();programmatic=true;final double start=cursorCss;animator=ValueAnimator.ofFloat(0,1);animator.setDuration(240);animator.setInterpolator(new DecelerateInterpolator());animator.addUpdateListener(a->{if(closed)return;cursorCss=start+(target-start)*(float)a.getAnimatedValue();web.scrollTo(0,(int)(cursorCss*scale()));guide.invalidate();markDirty();});animator.start();}
    private void switchChapter(String address){if(address==null||address.equals(chapter))return;saveProgress();chapter=address;try{byte[] hash=MessageDigest.getInstance("SHA-256").digest(address.getBytes(StandardCharsets.UTF_8));StringBuilder key=new StringBuilder();for(byte b:hash)key.append(String.format(Locale.ROOT,"%02x",b&255));progressKey=key.toString();progress=new ReadProgress(Double.parseDouble(preferences.getString(progressKey,"0")));}catch(Exception error){progress=new ReadProgress(0);}cursorCss=0;}
    private void saveProgress(){if(!progressKey.isEmpty())preferences.edit().putString(progressKey,Double.toString(progress.furthest())).apply();}
    public void markDirty(){dirty=true;if(closed||suspended||paused||busy||scheduled||web.getWidth()==0)return;scheduled=true;main.postDelayed(()->{scheduled=false;capture();},Math.max(0,180-(SystemClock.elapsedRealtime()-lastStarted)));}
    private void capture(){if(closed||suspended||paused||busy||!dirty||web.getWidth()==0)return;dirty=false;busy=true;lastStarted=SystemClock.elapsedRealtime();final String sourceChapter=chapter;final double sourceTop=cursorCss;final ReadProgress sourceProgress=progress;
        int[] location=new int[2];web.getLocationInWindow(location);Rect area=cropLocal();area.offset(location[0],location[1]);Bitmap bitmap=Bitmap.createBitmap(600,350,Bitmap.Config.ARGB_8888);
        try{PixelCopy.request(activity.getWindow(),area,bitmap,result->{if(closed){bitmap.recycle();busy=false;return;}if(result!=PixelCopy.SUCCESS){bitmap.recycle();finish(null,"화면 캡처 대기 중입니다.");return;}byte[] frame=HudRenderer.pack(bitmap);bitmap.recycle();transport.present(frame).whenComplete((receipt,error)->main.post(()->{if(closed){busy=false;return;}if(error==null&&sourceChapter.equals(chapter)){sourceProgress.acknowledge(sourceTop);main.removeCallbacks(save);main.postDelayed(save,700);}finish(receipt,error==null?null:"안경 전송에 실패했습니다. 전송 켜기로 다시 시도해 주세요.");}));},main);}catch(Exception error){bitmap.recycle();finish(null,"화면 캡처를 시작할 수 없습니다.");}
    }
    private void finish(HudTransport.Receipt receipt,String error){busy=false;if(closed)return;if(error!=null){status.setText(error);if(++failures>=3){paused=true;((Button)root.findViewById(R.id.reader_sync)).setText("전송 켜기");}else{dirty=true;main.postDelayed(this::markDirty,500);}}else{failures=0;status.setText("안경 화면 전송 확인 · "+receipt.milliseconds+"ms · 한 번: 다음 미독 / 두 번: 이전 / 길게: 목록");}if(dirty)markDirty();}
    public void setSuspended(boolean value){suspended=value;if(!value)markDirty();}
    public boolean back(){if(web.canGoBack()){web.goBack();return true;}close();return true;}
    @Override public void close(){if(closed)return;closed=true;saveProgress();main.removeCallbacksAndMessages(null);if(animator!=null)animator.cancel();decor.removeView(root);web.stopLoading();web.destroy();decor.setSystemUiVisibility(oldUiVisibility);onClose.run();}
}
