package com.memomind.companion;

import java.io.IOException;
import java.util.Arrays;

/** Bounded mono PCM16 to 16 kHz float audio, with FIR anti-aliasing for 48 kHz input. */
public final class Pcm16k {
    private final float[] audio=new float[16000*31];
    private final double[] taps=new double[63];
    private final float[] history=new float[63];
    private int rate=48000,position,phase,size,samples,clipped;
    private double squares;
    public Pcm16k(){
        double sum=0,cutoff=7200.0/48000;
        for(int i=0;i<taps.length;i++){
            int x=i-(taps.length-1)/2;
            double sinc=x==0?2*cutoff:Math.sin(2*Math.PI*cutoff*x)/(Math.PI*x);
            taps[i]=sinc*(0.54-0.46*Math.cos(2*Math.PI*i/(taps.length-1)));sum+=taps[i];
        }
        for(int i=0;i<taps.length;i++)taps[i]/=sum;
    }
    public void setRate(int value)throws IOException{
        if(value!=16000&&value!=48000)throw new IOException("Unsupported PCM sample rate: "+value);
        if(samples>0&&value!=rate)throw new IOException("PCM rate changed mid-session");rate=value;
    }
    public void accept(byte[] pcm)throws IOException{
        if(pcm.length%2!=0)throw new IOException("Unaligned PCM16");
        for(int i=0;i<pcm.length;i+=2){
            short raw=(short)((pcm[i]&255)|(pcm[i+1]<<8));float sample=raw/32768f;
            samples++;squares+=(double)sample*sample;if(Math.abs((int)raw)>=32760)clipped++;
            if(rate==16000){append(sample);continue;}
            history[position]=sample;position=(position+1)%history.length;
            if(++phase==3){phase=0;double filtered=0;int p=position;
                for(int j=0;j<taps.length;j++){p=(p+history.length-1)%history.length;filtered+=history[p]*taps[j];}
                append((float)filtered);
            }
        }
    }
    private void append(float v)throws IOException{if(size>=audio.length)throw new IOException("Maximum voice duration exceeded");audio[size++]=v;}
    public float[] finish()throws IOException{
        if(size<1600)throw new IOException("안경에서 수신한 음성이 너무 짧습니다.");
        // Moderate whole-utterance gain only. Avoid amplifying near-silence into hallucinated speech.
        float peak=0;for(int i=0;i<size;i++)peak=Math.max(peak,Math.abs(audio[i]));
        if(rms()<0.0005)throw new IOException("안경 음성이 너무 작습니다. 마이크 위치를 확인하세요.");
        float gain=peak>0?Math.min(4f,0.9f/peak):1f;
        gain=Math.max(1f,gain);float[] result=Arrays.copyOf(audio,size);
        for(int i=0;i<size;i++)result[i]=Math.max(-1f,Math.min(1f,result[i]*gain));return result;
    }
    public float[] drain(){float[] out=Arrays.copyOf(audio,size);size=0;return out;}
    public double rms(){return samples==0?0:Math.sqrt(squares/samples);}
    public double clipping(){return samples==0?0:(double)clipped/samples;}
    public int sampleCount(){return size;}
}
