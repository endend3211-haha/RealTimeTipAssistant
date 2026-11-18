package com.memomind.webtoon;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;

/** Native HTTPS only: never attempt to evade a MangaDex browser challenge. */
public final class MangaDexGateway {
    private final Set<String> media=Collections.synchronizedSet(new LinkedHashSet<>());
    private long lastRequest;
    private static final String API="https://api.mangadex.org";
    private static final String UUID="[0-9a-fA-F-]{36}";
    public static boolean validPath(String path){return path!=null&&path.length()<4096&&path.matches("/(?:manga(?:/"+UUID+"/feed)?|at-home/server/"+UUID+")(?:\\?[^#\\r\\n]*)?");}
    public synchronized JSONObject json(String path)throws Exception {
        if(!validPath(path))throw new IOException("허용되지 않은 MangaDex 요청입니다.");
        long delay=300-(System.currentTimeMillis()-lastRequest);if(delay>0)Thread.sleep(delay);lastRequest=System.currentTimeMillis();
        byte[] bytes=download(API+path,2*1024*1024,false);
        String text=new String(bytes,java.nio.charset.StandardCharsets.UTF_8);
        if(!text.trim().startsWith("{"))throw new IOException("MangaDex가 JSON 대신 브라우저 인증을 반환했습니다. 잠시 후 정식 앱 연결에서 다시 시도하세요.");
        JSONObject result=new JSONObject(text);register(result);return result;
    }
    private void remember(String url){synchronized(media){if(media.size()>2048)media.clear();media.add(url);}}
    private void register(JSONObject result)throws Exception {
        JSONArray rows=result.optJSONArray("data");if(rows!=null)for(int i=0;i<rows.length();i++){
            JSONObject row=rows.optJSONObject(i);if(row==null||!"manga".equals(row.optString("type")))continue;
            JSONArray relationships=row.optJSONArray("relationships");if(relationships==null)continue;
            for(int j=0;j<relationships.length();j++){JSONObject relation=relationships.optJSONObject(j);if(relation==null||!"cover_art".equals(relation.optString("type")))continue;JSONObject a=relation.optJSONObject("attributes");if(a==null)continue;String file=a.optString("fileName");if(file.matches("[a-zA-Z0-9_.-]+"))remember("https://uploads.mangadex.org/covers/"+row.getString("id")+"/"+file+".256.jpg");}
        }
        JSONObject chapter=result.optJSONObject("chapter");if(chapter!=null){String base=result.getString("baseUrl");URL u=new URL(base);if(!"https".equals(u.getProtocol())||u.getUserInfo()!=null)throw new IOException("잘못된 이미지 서버입니다.");String hash=chapter.getString("hash");if(!hash.matches("[a-zA-Z0-9]+"))throw new IOException("잘못된 회차 해시입니다.");
            for(String type:new String[]{"dataSaver","data"}){JSONArray files=chapter.optJSONArray(type);if(files==null)continue;for(int i=0;i<files.length();i++){String f=files.getString(i);if(!f.matches("[a-zA-Z0-9_.-]+"))continue;remember(base.replaceAll("/$","")+"/"+(type.equals("dataSaver")?"data-saver":"data")+"/"+hash+"/"+f);}}
        }
    }
    public String image(String url)throws Exception {
        if(!media.contains(url))throw new IOException("API가 발급한 표지와 본문만 불러올 수 있습니다.");
        long start=System.currentTimeMillis();byte[] bytes;
        try{bytes=download(url,20*1024*1024,true);}catch(Exception e){report(url,false,0,System.currentTimeMillis()-start);throw e;}
        report(url,true,bytes.length,System.currentTimeMillis()-start);
        BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
        if(options.outWidth<1||options.outHeight<1)throw new IOException("이미지가 아닙니다.");options.inSampleSize=1;
        while((long)(options.outWidth/options.inSampleSize)*(options.outHeight/options.inSampleSize)>4000000L||options.outHeight/options.inSampleSize>8192)options.inSampleSize*=2;
        options.inJustDecodeBounds=false;Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(bitmap==null)throw new IOException("이미지 해독 실패");
        if(bitmap.getWidth()>900){Bitmap scaled=Bitmap.createScaledBitmap(bitmap,900,Math.max(1,bitmap.getHeight()*900/bitmap.getWidth()),true);bitmap.recycle();bitmap=scaled;}
        ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,85,out);bitmap.recycle();
        if(out.size()>1500000)throw new IOException("본문 이미지가 너무 큽니다.");return "data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
    }
    private byte[] download(String url,int limit,boolean image)throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setRequestProperty("User-Agent","PocketManga/2.0 (MemoMind companion)");c.setRequestProperty("Accept",image?"image/*":"application/json");
        try{int code=c.getResponseCode();if(code==429)throw new IOException("요청 제한: "+c.getHeaderField("Retry-After")+"초 후 다시 시도하세요.");if(code!=200)throw new IOException("MangaDex HTTP "+code);String type=c.getContentType();if(image&&(type==null||!type.startsWith("image/")))throw new IOException("이미지 대신 인증 또는 오류 화면이 반환됐습니다.");
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new IOException("응답 크기 제한 초과");out.write(buffer,0,n);}return out.toByteArray();}
        }finally{c.disconnect();}
    }
    private void report(String url,boolean success,int bytes,long duration){if(!url.contains("/data-saver/")&&!url.contains("/data/"))return;try{HttpURLConnection c=(HttpURLConnection)new URL("https://api.mangadex.network/report").openConnection();c.setConnectTimeout(1500);c.setReadTimeout(1500);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("User-Agent","PocketManga/2.0 (MemoMind companion)");byte[] body=new JSONObject().put("url",url).put("success",success).put("cached",false).put("bytes",bytes).put("duration",duration).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);try(OutputStream out=c.getOutputStream()){out.write(body);}c.getResponseCode();c.disconnect();}catch(Exception ignored){}}
}
