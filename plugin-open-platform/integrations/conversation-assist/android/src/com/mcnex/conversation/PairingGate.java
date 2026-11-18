package com.mcnex.conversation;
final class PairingGate {
 private long until;private boolean used;
 synchronized void open(long now){until=now+60000;used=false;}
 synchronized boolean claim(String origin,String plugin,long now){if(used||now>until||!"com.mcnex.conversation.phone".equals(plugin)||origin==null||!origin.matches("http://127\\.0\\.0\\.1:[0-9]{1,5}"))return false;try{int port=Integer.parseInt(origin.substring(origin.lastIndexOf(':')+1));if(port<1||port>65535)return false;}catch(Exception e){return false;}used=true;return true;}
}
