package com.mcnex.conversation;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONObject;

final class MeetingLink implements AutoCloseable {
    private final ServerSocket server;
    private final String code;
    private final EloqSession session;
    

    MeetingLink(String code, EloqSession session) throws IOException {
        this.code = code; this.session = session;
        ServerSocket listener = new ServerSocket();
        try { listener.bind(new InetSocketAddress("127.0.0.1", 8795)); }
        catch (IOException error) { listener.close(); throw error; }
        server = listener;
        new Thread(this::listen, "local-meeting-link").start();
    }


    private void listen() {
        while (!server.isClosed()) {
            try (Socket socket = server.accept()) {
                socket.setSoTimeout(2000);
                respond(socket);
            } catch (IOException | NumberFormatException ignored) { }
        }
        session.close();
    }

    private void respond(Socket socket) throws IOException {
        BufferedInputStream input = new BufferedInputStream(socket.getInputStream());
        String request = line(input);
        String auth = ""; int size = 0;
        for (int i = 0; i < 32; i++) {
            String header = line(input);
            if (header.isEmpty()) break;
            if (header.regionMatches(true, 0, "Authorization:", 0, 14)) auth = header.substring(14).trim();
            if (header.regionMatches(true, 0, "Content-Length:", 0, 15)) size = Integer.parseInt(header.substring(15).trim());
            if (i == 31) throw new IOException("Too many headers");
        }
        String[] parts = request.split(" ");
        if (parts.length != 3 || size < 0 || size > 65536) throw new IOException("Invalid request");
        String status = "200 OK";
        String data = "{}";
        if (parts[0].equals("OPTIONS")) status = "204 No Content";
        else if (parts[1].equals("/eloq/health") && parts[0].equals("GET")) {
            data = "{\"ok\":true,\"version\":\"1.2.0 Local\",\"loaded\":true}";
        } else if (!MessageDigest.isEqual(("Bearer " + code).getBytes(StandardCharsets.UTF_8), auth.getBytes(StandardCharsets.UTF_8))) {
            status = "401 Unauthorized";
        } else {
            byte[] body = new byte[size];
            new DataInputStream(input).readFully(body);
            try { data = session.call(parts[0], parts[1], body).toString(); }
            catch (Exception | LinkageError error) {
                status = "422 Unprocessable Content";
                data = "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(error.getMessage())) + "}";
            }
        }
        byte[] payload = status.startsWith("204") ? new byte[0] : data.getBytes(StandardCharsets.UTF_8);
        String headers = "HTTP/1.1 " + status + "\r\nContent-Type: application/json; charset=utf-8\r\n"
            + "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            + "Access-Control-Allow-Headers: Authorization, Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\n"
            + "Cache-Control: no-store\r\nConnection: close\r\nContent-Length: " + payload.length + "\r\n\r\n";
        socket.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));
        socket.getOutputStream().write(payload);
    }

    private static String line(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i = 0; i < 4096; i++) {
            int b = input.read();
            if (b < 0) throw new EOFException();
            if (b == '\n') return bytes.toString("US-ASCII").stripTrailing();
            bytes.write(b);
        }
        throw new IOException("Header too long");
    }

    @Override public void close() {
        try { server.close(); } catch (IOException ignored) { }
    }
}

