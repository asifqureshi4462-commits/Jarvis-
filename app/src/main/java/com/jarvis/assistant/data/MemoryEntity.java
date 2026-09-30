package com.jarvis.assistant.data;

import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "memories")
public class MemoryEntity {

    @PrimaryKey(autoGenerate = true)
    private int id;

    private String fact;
    private String category;
    private long timestamp;

    public MemoryEntity(String fact, String category, long timestamp) {
        this.fact = fact;
        this.category = category;
        this.timestamp = timestamp;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getFact() {
        return fact;
    }

    public void setFact(String fact) {
        this.fact = fact;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }
}
