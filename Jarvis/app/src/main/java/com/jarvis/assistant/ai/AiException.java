package com.jarvis.assistant.ai;

/** An AI failure with a message that is safe to show to the user. */
public class AiException extends Exception {
    public final int code;
    public final boolean keyProblem;

    public AiException(String message, int code) {
        this(message, code, false);
    }

    public AiException(String message, int code, boolean keyProblem) {
        super(message);
        this.code = code;
        this.keyProblem = keyProblem;
    }
}
