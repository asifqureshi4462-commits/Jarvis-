package com.jarvis.assistant.ui;

import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.jarvis.assistant.R;
import com.jarvis.assistant.data.DbHelper;
import com.jarvis.assistant.data.Row;

import java.util.ArrayList;
import java.util.List;

/** Command history, saved facts (memory) and chat history, each with delete options. */
public class HistoryActivity extends AppCompatActivity {
    private static final String[] TABLES = {DbHelper.T_COMMANDS, DbHelper.T_MEMORY, DbHelper.T_MESSAGES};
    private static final String[] HINTS = {
            "Commands JARVIS ran on your phone. Long-press an entry to delete it.",
            "Facts you asked JARVIS to remember (say \"remember that ...\"). Long-press to delete.",
            "Your saved conversation, also used as context for the AI. Long-press to delete."
    };

    private DbHelper db;
    private int tab = 0;
    private final List<Row> rows = new ArrayList<>();
    private ArrayAdapter<Row> adapter;
    private TextView empty;
    private TextView hint;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_history);
        db = DbHelper.get(this);
        empty = findViewById(R.id.historyEmpty);
        hint = findViewById(R.id.tabHint);
        ListView list = findViewById(R.id.historyList);

        adapter = new ArrayAdapter<>(this, R.layout.item_row, R.id.rowText, rows);
        list.setAdapter(adapter);

        findViewById(R.id.btnTabCommands).setOnClickListener(v -> select(0));
        findViewById(R.id.btnTabMemory).setOnClickListener(v -> select(1));
        findViewById(R.id.btnTabChat).setOnClickListener(v -> select(2));

        list.setOnItemLongClickListener((p, v, pos, id) -> {
            final Row row = rows.get(pos);
            new MaterialAlertDialogBuilder(this)
                    .setTitle("Delete this entry?")
                    .setPositiveButton("Delete", (d, w) -> {
                        db.delete(TABLES[tab], row.id);
                        refresh();
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
            return true;
        });

        findViewById(R.id.btnClear).setOnClickListener(v ->
                new MaterialAlertDialogBuilder(this)
                        .setTitle("Clear everything in this tab?")
                        .setMessage("This cannot be undone.")
                        .setPositiveButton("Clear", (d, w) -> {
                            db.clear(TABLES[tab]);
                            refresh();
                        })
                        .setNegativeButton("Cancel", null)
                        .show());

        select(0);
    }

    private void select(int t) {
        tab = t;
        hint.setText(HINTS[t]);
        refresh();
    }

    private void refresh() {
        rows.clear();
        switch (tab) {
            case 0: rows.addAll(db.commands(300)); break;
            case 1: rows.addAll(db.facts(300)); break;
            default: rows.addAll(db.chatRows(300)); break;
        }
        adapter.notifyDataSetChanged();
        empty.setVisibility(rows.isEmpty() ? View.VISIBLE : View.GONE);
    }
}
