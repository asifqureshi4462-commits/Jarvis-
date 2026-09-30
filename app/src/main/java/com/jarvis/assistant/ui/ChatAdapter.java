package com.jarvis.assistant.ui;

import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import com.jarvis.assistant.R;

import java.util.ArrayList;
import java.util.List;

public class ChatAdapter extends RecyclerView.Adapter<ChatAdapter.ChatViewHolder> {

    private final List<ChatMessage> messages = new ArrayList<>();

    public void addMessage(ChatMessage message) {
        messages.add(message);
        notifyItemInserted(messages.size() - 1);
    }

    public void setMessages(List<ChatMessage> newMessages) {
        messages.clear();
        if (newMessages != null) {
            messages.addAll(newMessages);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ChatViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_chat_message, parent, false);
        return new ChatViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ChatViewHolder holder, int position) {
        ChatMessage msg = messages.get(position);
        holder.bind(msg);
    }

    @Override
    public int getItemCount() {
        return messages.size();
    }

    static class ChatViewHolder extends RecyclerView.ViewHolder {
        private final LinearLayout container;
        private final TextView tvSender;
        private final TextView tvMessageBody;

        public ChatViewHolder(@NonNull View itemView) {
            super(itemView);
            container = itemView.findViewById(R.id.llMessageContainer);
            tvSender = itemView.findViewById(R.id.tvSender);
            tvMessageBody = itemView.findViewById(R.id.tvMessageBody);
        }

        public void bind(ChatMessage msg) {
            tvSender.setText(msg.getSender() + " · " + msg.getTimestamp());
            tvMessageBody.setText(msg.getText());

            if (msg.isUser()) {
                container.setGravity(Gravity.END);
                tvSender.setGravity(Gravity.END);
                tvMessageBody.setBackgroundResource(R.drawable.bg_chat_user);
                tvMessageBody.setTextColor(ContextCompat.getColor(itemView.getContext(), R.color.jarvis_text_primary));
            } else {
                container.setGravity(Gravity.START);
                tvSender.setGravity(Gravity.START);
                tvMessageBody.setBackgroundResource(R.drawable.bg_chat_jarvis);
                tvMessageBody.setTextColor(ContextCompat.getColor(itemView.getContext(), R.color.jarvis_text_primary));
            }
        }
    }
}
