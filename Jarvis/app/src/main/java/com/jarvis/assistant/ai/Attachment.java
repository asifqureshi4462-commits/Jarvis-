package com.jarvis.assistant.ai;

/** A file sent to the AI with the next message: either plain text or base64 data (PDF/image). */
public class Attachment {
    public String name;
    public String mime;
    public String text;
    public String base64;
}
