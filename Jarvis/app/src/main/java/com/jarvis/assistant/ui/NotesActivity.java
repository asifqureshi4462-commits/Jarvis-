package com.jarvis.assistant.ui;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.jarvis.assistant.R;
import com.jarvis.assistant.data.DbHelper;
import com.jarvis.assistant.data.Row;

import java.util.ArrayList;
import java.util.List;

public class NotesActivity extends AppCompatActivity {
    private DbHelper db;
    private final List<Row> rows = new ArrayList<>();
    private ArrayAdapter<Row> adapter;
    private EditText input;
    private TextView empty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_notes);
        db = DbHelper.get(this);
        input = findViewById(R.id.noteInput);
        empty = findViewById(R.id.notesEmpty);
        ListView list = findViewById(R.id.notesList);

        adapter = new ArrayAdapter<>(this, R.layout.item_row, R.id.rowText, rows);
        list.setAdapter(adapter);

        findViewById(R.id.btnAddNote).setOnClickListener(v -> {
            String body = input.getText().toString().trim();
            if (body.isEmpty()) return;
            db.addNote(body.length() > 2000 ? body.substring(0, 2000) : body);
            input.setText("");
            refresh();
        });

        list.setOnItemClickListener((p, v, pos, id) -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                String text = rows.get(pos).text;
                int cut = text.lastIndexOf('\n');
                cm.setPrimaryClip(ClipData.newPlainText("Note", cut > 0 ? text.substring(0, cut) : text));
                Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show();
            }
        });

        list.setOnItemLongClickListener((p, v, pos, id) -> {
            final Row row = rows.get(pos);
            new MaterialAlertDialogBuilder(this)
                    .setTitle("Delete this note?")
                    .setPositiveButton("Delete", (d, w) -> {
                        db.delete(DbHelper.T_NOTES, row.id);
                        refresh();
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
            return true;
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        rows.clear();
        rows.addAll(db.notes(500));
        adapter.notifyDataSetChanged();
        empty.setVisibility(rows.isEmpty() ? View.VISIBLE : View.GONE);
    }
}
