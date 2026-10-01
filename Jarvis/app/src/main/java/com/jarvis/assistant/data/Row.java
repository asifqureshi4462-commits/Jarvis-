package com.jarvis.assistant.data;

/** A displayable database row (used by list screens). */
public class Row {
    public final long id;
    public final String text;

    public Row(long id, String text) {
        this.id = id;
        this.text = text;
    }

    @Override
    public String toString() {
        return text;
    }
}
