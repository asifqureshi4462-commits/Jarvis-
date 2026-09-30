package com.jarvis.assistant.data;

import androidx.room.Dao;
import androidx.room.Delete;
import androidx.room.Insert;
import androidx.room.Query;

import java.util.List;

@Dao
public interface JarvisDao {

    // Notes
    @Query("SELECT * FROM notes ORDER BY isPinned DESC, timestamp DESC")
    List<NoteEntity> getAllNotes();

    @Insert
    long insertNote(NoteEntity note);

    @Delete
    void deleteNote(NoteEntity note);

    // Memories
    @Query("SELECT * FROM memories ORDER BY timestamp DESC")
    List<MemoryEntity> getAllMemories();

    @Insert
    long insertMemory(MemoryEntity memory);

    @Delete
    void deleteMemory(MemoryEntity memory);
}
