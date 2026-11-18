package com.mcnex.conversation;
import java.io.IOException;import java.nio.charset.StandardCharsets;
final class ModelFormat {
 static String detect(byte[] header)throws IOException{if(header.length>=8&&new String(header,0,8,StandardCharsets.US_ASCII).equals("LITERTLM"))return "litertlm";if(header.length>=8&&new String(header,0,4,StandardCharsets.US_ASCII).equals("GGUF")&&(header[4]==2||header[4]==3)&&header[5]==0&&header[6]==0&&header[7]==0)return "gguf";throw new IOException("지원하는 .litertlm 또는 GGUF v2/v3 모델을 선택하세요");}
}
