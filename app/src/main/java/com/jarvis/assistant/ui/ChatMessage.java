package com.jarvis.assistant.ui;

public class ChatMessage {
    private final String sender;
    private final String text;
    private final String timestamp;
    private final boolean isUser;

    public ChatMessage(String sender, String text, String timestamp, boolean isUser) {
        this.sender = sender;
        this.text = text;
        this.timestamp = timestamp;
        this.isUser = isUser;
    }

    public String getSender() {
        return sender;
    }

    public String getText() {
        return text;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public boolean isUser() {
        return isUser;
    }
}
