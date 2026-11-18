package com.memomind.webtoon;
import android.graphics.*;
import android.text.*;
import org.json.JSONObject;

public final class HudRenderer {
    private HudRenderer() {}
    public static byte[] title(JSONObject item, Bitmap cover) {
        Bitmap image = Bitmap.createBitmap(600,350,Bitmap.Config.ARGB_8888); Canvas c = new Canvas(image);c.drawColor(Color.BLACK);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);p.setColor(Color.WHITE);p.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));p.setTextSize(20);c.drawText("JIKAN".equals(item.optString("source"))?"Pocket 만화 정보":"Pocket 웹툰",24,32,p);
        p.setColor(0xff333333);c.drawRect(24,58,168,274,p);
        if(cover!=null)c.drawBitmap(cover,null,new Rect(24,58,168,274),new Paint(Paint.FILTER_BITMAP_FLAG));
        else{p.setColor(Color.LTGRAY);p.setTextSize(17);c.drawText("표지 없음",57,170,p);}
        TextPaint text=new TextPaint(Paint.ANTI_ALIAS_FLAG);text.setColor(Color.WHITE);text.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));text.setTextSize(32);
        StaticLayout title=StaticLayout.Builder.obtain(item.optString("title","제목 없음"),0,item.optString("title","제목 없음").length(),text,378).setMaxLines(3).setEllipsize(TextUtils.TruncateAt.END).setIncludePad(false).setLineSpacing(4,1).build();
        c.save();c.translate(194,68);title.draw(c);c.restore();
        p.setColor(Color.WHITE);p.setTextSize(18);String provider=item.optString("provider");provider="NAVER".equals(provider)?"네이버웹툰":"KAKAO".equals(provider)?"카카오웹툰":"KAKAO_PAGE".equals(provider)?"카카오페이지":"웹툰";c.drawText(provider,194,245,p);
        p.setTextSize(15);c.drawText("1번: 다음 · 2번: 이전 · 길게: 읽기 · "+item.optInt("position",1)+"/"+item.optInt("total",1),24,324,p);
        byte[] packed=pack(image);image.recycle();return packed;
    }
    public static byte[] pack(Bitmap image) { int[] argb=new int[600*350];image.getPixels(argb,0,600,0,0,600,350);return Gray4.pack(argb); }
}
