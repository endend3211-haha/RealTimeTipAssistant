package com.memomind.webtoon;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.LruCache;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

/** Matches upstream src/routes/webtoons.ts; there is no chapter-image endpoint. */
public final class WebtoonApi {
    public static final String DEFAULT_BASE = "https://korea-webtoon-api-cc7dda2f0d77.herokuapp.com";
    private final LruCache<String, Bitmap> covers = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getByteCount(); }
    };
    private final LruCache<String, JSONObject> mangaCache = new LruCache<>(20);
    private final LruCache<String, Long> mangaTimes = new LruCache<>(20);
    private long lastMangaRequest;
    public JSONObject list(String base, JSONObject query) throws Exception {
        URI checked = new URI(base);
        if (!"https".equals(checked.getScheme()) || checked.getHost() == null || checked.getRawUserInfo() != null || checked.getRawQuery() != null || checked.getFragment() != null) throw new IOException("HTTPS API 서버 주소를 확인해 주세요.");
        if ("JIKAN".equals(query.optString("source"))) return mangaList(base, query);
        int page = query.optInt("page", 1), perPage = query.optInt("perPage", 20);
        String provider = query.optString("provider", ""), day = query.optString("updateDay", "");
        if (page < 1 || perPage < 1 || perPage > 100) throw new IOException("페이지 범위가 올바르지 않습니다.");
        if (!provider.isEmpty() && !provider.matches("NAVER|KAKAO|KAKAO_PAGE")) throw new IOException("지원하지 않는 플랫폼입니다.");
        if (!day.isEmpty() && !day.matches("MON|TUE|WED|THU|FRI|SAT|SUN")) throw new IOException("요일을 확인해 주세요.");
        Uri.Builder url = Uri.parse(base.replaceAll("/+$", "") + "/webtoons").buildUpon()
            .appendQueryParameter("page", Integer.toString(page)).appendQueryParameter("perPage", Integer.toString(perPage)).appendQueryParameter("sort", "ASC");
        String keyword = query.optString("keyword", "").trim();
        if (!keyword.isEmpty()) url.appendQueryParameter("keyword", keyword);
        if (!provider.isEmpty()) url.appendQueryParameter("provider", provider);
        if (!day.isEmpty()) url.appendQueryParameter("updateDay", day);
        JSONObject result = new JSONObject(new String(download(url.toString(), 2 * 1024 * 1024), StandardCharsets.UTF_8));
        result.getJSONArray("webtoons"); result.getBoolean("isLastPage");
        return result;
    }
    public JSONObject mangaDetail(String base, long id) throws Exception {
        if(id<1)throw new IOException("만화 번호를 확인해 주세요.");
        return normalizeManga(mangaJson(base,"/manga/"+id).getJSONObject("data"));
    }
    private JSONObject mangaList(String base,JSONObject query) throws Exception {
        int page=query.optInt("page",1),limit=query.optInt("perPage",20);if(page<1||limit<1||limit>25)throw new IOException("Jikan 페이지 범위를 확인해 주세요.");
        boolean top=query.optBoolean("top");Uri.Builder path=Uri.parse(top?"/top/manga":"/manga").buildUpon().appendQueryParameter("page",Integer.toString(page)).appendQueryParameter("limit",Integer.toString(limit));
        if(!top&&!query.optString("keyword").trim().isEmpty())path.appendQueryParameter("q",query.optString("keyword").trim());
        JSONObject response=mangaJson(base,path.build().toString()),pagination=response.optJSONObject("pagination"),counts=pagination==null?null:pagination.optJSONObject("items");
        JSONArray rows=response.getJSONArray("data"),items=new JSONArray();for(int i=0;i<rows.length();i++)items.put(normalizeManga(rows.getJSONObject(i)));
        return new JSONObject().put("webtoons",items).put("total",counts==null?rows.length():counts.optInt("total",rows.length())).put("isLastPage",pagination==null||!pagination.optBoolean("has_next_page"));
    }
    private synchronized JSONObject mangaJson(String base,String path) throws Exception {
        URI checked=new URI(base);if(!"https".equals(checked.getScheme())||checked.getHost()==null||checked.getRawUserInfo()!=null||checked.getRawQuery()!=null||checked.getFragment()!=null)throw new IOException("Jikan HTTPS 주소를 확인해 주세요.");
        String url=base.replaceAll("/+$","")+path;JSONObject cached=mangaCache.get(url);Long time=mangaTimes.get(url);long now=android.os.SystemClock.elapsedRealtime();
        if(cached!=null&&time!=null&&now-time<300000)return cached;
        Thread.sleep(Math.max(0,1100-(now-lastMangaRequest)));lastMangaRequest=android.os.SystemClock.elapsedRealtime();
        JSONObject result=new JSONObject(new String(download(url,2*1024*1024),StandardCharsets.UTF_8));mangaCache.put(url,result);mangaTimes.put(url,android.os.SystemClock.elapsedRealtime());return result;
    }
    private JSONObject normalizeManga(JSONObject row) throws Exception {
        JSONObject images=row.optJSONObject("images"),jpg=images==null?null:images.optJSONObject("jpg");JSONArray covers=new JSONArray();if(jpg!=null&&!jpg.isNull("image_url"))covers.put(jpg.getString("image_url"));
        JSONArray input=row.optJSONArray("authors"),authors=new JSONArray();if(input!=null)for(int i=0;i<input.length();i++){JSONObject author=input.optJSONObject(i);if(author!=null&&!author.isNull("name"))authors.put(author.getString("name"));}
        return new JSONObject().put("id",String.valueOf(row.optLong("mal_id"))).put("title",row.optString("title","제목 없음")).put("source","JIKAN").put("provider","JIKAN").put("authors",authors).put("thumbnail",covers).put("url","").put("catalogUrl",row.optString("url")).put("synopsis",row.isNull("synopsis")?"":row.optString("synopsis"));
    }
    public Bitmap cover(JSONObject item) throws Exception {
        JSONArray candidates = item.optJSONArray("thumbnail"); if (candidates == null) return null;
        Exception failure = null;
        for (int i = 0; i < Math.min(3, candidates.length()); i++) {
            String url = candidates.optString(i); Bitmap cached = covers.get(url); if (cached != null) return cached;
            try {
                byte[] bytes = download(url, 4 * 1024 * 1024);
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 20000 || bounds.outHeight > 20000) throw new IOException("표지 크기가 올바르지 않습니다.");
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
                while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                if (bitmap == null) throw new IOException("표지를 읽을 수 없습니다.");
                covers.put(url, bitmap); return bitmap;
            } catch (Exception error) { failure = error; }
        }
        if (failure != null) throw failure; return null;
    }
    private byte[] download(String address, int limit) throws Exception {
        URL url = new URL(address);
        for (int redirect = 0; redirect <= 3; redirect++) {
            if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null) throw new IOException("HTTPS 주소만 지원합니다.");
            HttpURLConnection connection = (HttpURLConnection)url.openConnection();
            connection.setConnectTimeout(10000); connection.setReadTimeout(10000); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/json,image/*;q=0.9,*/*;q=0.5");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location"); if (location == null) throw new IOException("리다이렉트 주소가 없습니다."); url = new URL(url, location); continue;
                }
                if (status != 200) throw new IOException("API 또는 표지 서버 응답 오류 (" + status + ")");
                if (connection.getContentLengthLong() > limit) throw new IOException("응답 크기가 너무 큽니다.");
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int size;
                    while ((size = input.read(buffer)) != -1) { if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("요청 취소"); if (output.size() + size > limit) throw new IOException("응답 크기가 너무 큽니다."); output.write(buffer, 0, size); }
                    return output.toByteArray();
                }
            } finally { connection.disconnect(); }
        }
        throw new IOException("리다이렉트가 너무 많습니다.");
    }
}
