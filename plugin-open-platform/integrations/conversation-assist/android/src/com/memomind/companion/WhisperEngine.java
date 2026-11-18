package com.memomind.companion;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Multilingual Whisper base Q5_1, local CPU only, fixed Korean transcription. */
public final class WhisperEngine implements AutoCloseable {
    static{System.loadLibrary("memo-whisper");}
    private volatile long handle;
    private WhisperEngine(String path)throws IOException{handle=nativeLoad(path);if(handle==0)throw new IOException("Whisper 모델 초기화 실패");}
    public static WhisperEngine load(Context context)throws IOException{
        String asset="ggml-base-q5_1.bin";File model=new File(context.getFilesDir(),asset);
        if(!model.isFile()||model.length()!=59707625L){
            File temporary=new File(context.getFilesDir(),asset+".tmp");
            try(InputStream input=context.getAssets().open(asset);OutputStream output=new FileOutputStream(temporary)){
                byte[] bytes=new byte[65536];int n;while((n=input.read(bytes))!=-1)output.write(bytes,0,n);
            }
            if(temporary.length()!=59707625L)throw new IOException("내장 한국어 모델 복사 실패");
            java.nio.file.Files.move(temporary.toPath(),model.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        java.security.MessageDigest digest;
        try{digest=java.security.MessageDigest.getInstance("SHA-256");}catch(java.security.NoSuchAlgorithmException e){throw new IOException(e);}
        try(InputStream input=new FileInputStream(model)){byte[] bytes=new byte[65536];int n;while((n=input.read(bytes))!=-1)digest.update(bytes,0,n);}
        StringBuilder actual=new StringBuilder();for(byte value:digest.digest())actual.append(String.format(java.util.Locale.ROOT,"%02x",value&255));
        if(!actual.toString().equals("422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898"))throw new IOException("음성 모델 무결성 확인 실패. 모델을 다시 가져오세요.");
        return new WhisperEngine(model.getAbsolutePath());
    }
    public synchronized String transcribe(float[] samples)throws IOException{
        if(handle==0)throw new IOException("Whisper is closed");
        int threads=Math.max(1,Math.min(4,Runtime.getRuntime().availableProcessors()));
        return new String(nativeTranscribe(handle,samples,threads),StandardCharsets.UTF_8).trim();
    }
    public void cancel(){long current=handle;if(current!=0)nativeCancel(current);}
    @Override public synchronized void close(){if(handle!=0){nativeFree(handle);handle=0;}}
    private static native long nativeLoad(String path);
    private static native byte[] nativeTranscribe(long handle,float[] audio,int threads)throws IOException;
    private static native void nativeCancel(long handle);
    private static native void nativeFree(long handle);
}
