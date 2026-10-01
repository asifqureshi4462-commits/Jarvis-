package com.jarvis.assistant.data;

/** One chat message (role is "user" or "model"). */
public class Message {
    public final long id;
    public final String role;
    public final String text;
    public final long time;

    public Message(long id, String role, String text, long time) {
        this.id = id;
        this.role = role;
        this.text = text;
        this.time = time;
    }

    public boolean isUser() {
        return "user".equals(role);
    }
}
