package com.mcnex.conversation;
import android.content.*;import android.database.*;import android.net.Uri;import android.os.*;import java.io.*;
public final class MeetingShareProvider extends ContentProvider {
 public boolean onCreate(){return true;}
 private File file(Uri uri)throws FileNotFoundException{String name=uri.getLastPathSegment();if(name==null||!name.matches("meeting-[a-f0-9-]{36}\\.html"))throw new FileNotFoundException();File f=new File(new File(getContext().getCacheDir(),"shares"),name);if(!f.isFile())throw new FileNotFoundException();return f;}
 public String getType(Uri uri){return "text/html";}
 public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!mode.equals("r"))throw new FileNotFoundException("Read only");return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
 public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){try{File f=file(uri);String[] cols=projection==null?new String[]{"_display_name","_size"}:projection;MatrixCursor cursor=new MatrixCursor(cols);Object[] row=new Object[cols.length];for(int i=0;i<cols.length;i++)row[i]=cols[i].equals("_display_name")?f.getName():cols[i].equals("_size")?f.length():null;cursor.addRow(row);return cursor;}catch(Exception e){return null;}}
 public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
