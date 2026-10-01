package com.jarvis.assistant.ui;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.jarvis.assistant.R;
import com.jarvis.assistant.data.Message;

import java.util.ArrayList;
import java.util.List;

/** Chat bubbles. Long-press a bubble to copy its text. */
public class MessageAdapter extends RecyclerView.Adapter<MessageAdapter.VH> {
    private final List<Message> items = new ArrayList<>();

    static class VH extends RecyclerView.ViewHolder {
        final LinearLayout root;
        final TextView text;

        VH(View v) {
            super(v);
            root = v.findViewById(R.id.msgRoot);
            text = v.findViewById(R.id.messageText);
        }
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_message, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        Message m = items.get(position);
        boolean user = m.isUser();
        h.root.setGravity(user ? Gravity.END : Gravity.START);
        h.text.setBackgroundResource(user ? R.drawable.bubble_user : R.drawable.bubble_ai);
        h.text.setText(m.text);
        h.text.setOnLongClickListener(v -> {
            Context c = v.getContext();
            ClipboardManager cm = (ClipboardManager) c.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(ClipData.newPlainText("JARVIS", m.text));
                Toast.makeText(c, "Copied", Toast.LENGTH_SHORT).show();
            }
            return true;
        });
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    public void add(Message m) {
        items.add(m);
        notifyItemInserted(items.size() - 1);
    }

    public void setAll(List<Message> list) {
        items.clear();
        items.addAll(list);
        notifyDataSetChanged();
    }
}
