package com.jarvis.assistant.ui;

import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AlphaAnimation;
import android.view.animation.Animation;
import android.view.animation.ScaleAnimation;
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

    public void setSpeakingAt(int position, boolean speaking) {
        if (position >= 0 && position < messages.size()) {
            messages.get(position).setSpeaking(speaking);
            notifyItemChanged(position);
        }
    }

    public void clearAllSpeaking() {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i).isSpeaking()) {
                messages.get(i).setSpeaking(false);
                notifyItemChanged(i);
            }
        }
    }

    public int getLastMessageIndex() {
        return messages.size() - 1;
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
        private final LinearLayout llSpeakingIndicator;
        private final View waveBar1;
        private final View waveBar2;
        private final View waveBar3;
        private final View waveBar4;

        public ChatViewHolder(@NonNull View itemView) {
            super(itemView);
            container = itemView.findViewById(R.id.llMessageContainer);
            tvSender = itemView.findViewById(R.id.tvSender);
            tvMessageBody = itemView.findViewById(R.id.tvMessageBody);
            llSpeakingIndicator = itemView.findViewById(R.id.llSpeakingIndicator);
            waveBar1 = itemView.findViewById(R.id.waveBar1);
            waveBar2 = itemView.findViewById(R.id.waveBar2);
            waveBar3 = itemView.findViewById(R.id.waveBar3);
            waveBar4 = itemView.findViewById(R.id.waveBar4);
        }

        public void bind(ChatMessage msg) {
            tvSender.setText(msg.getSender() + " · " + msg.getTimestamp());
            tvMessageBody.setText(msg.getText());

            if (msg.isUser()) {
                container.setGravity(Gravity.END);
                tvSender.setGravity(Gravity.END);
                tvMessageBody.setBackgroundResource(R.drawable.bg_chat_user);
                tvMessageBody.setTextColor(ContextCompat.getColor(itemView.getContext(), R.color.jarvis_text_primary));
                if (llSpeakingIndicator != null) {
                    llSpeakingIndicator.setVisibility(View.GONE);
                }
            } else {
                container.setGravity(Gravity.START);
                tvSender.setGravity(Gravity.START);
                tvMessageBody.setBackgroundResource(R.drawable.bg_chat_jarvis);
                tvMessageBody.setTextColor(ContextCompat.getColor(itemView.getContext(), R.color.jarvis_text_primary));

                if (llSpeakingIndicator != null) {
                    if (msg.isSpeaking()) {
                        llSpeakingIndicator.setVisibility(View.VISIBLE);
                        startWaveAnimation(waveBar1, 350, 0);
                        startWaveAnimation(waveBar2, 450, 100);
                        startWaveAnimation(waveBar3, 300, 50);
                        startWaveAnimation(waveBar4, 400, 150);
                    } else {
                        llSpeakingIndicator.setVisibility(View.GONE);
                        clearWaveAnimation(waveBar1);
                        clearWaveAnimation(waveBar2);
                        clearWaveAnimation(waveBar3);
                        clearWaveAnimation(waveBar4);
                    }
                }
            }
        }

        private void startWaveAnimation(View bar, long duration, long offset) {
            if (bar == null) return;
            ScaleAnimation anim = new ScaleAnimation(
                    1.0f, 1.0f, 0.4f, 1.4f,
                    Animation.RELATIVE_TO_SELF, 0.5f,
                    Animation.RELATIVE_TO_SELF, 0.5f
            );
            anim.setDuration(duration);
            anim.setStartOffset(offset);
            anim.setRepeatMode(Animation.REVERSE);
            anim.setRepeatCount(Animation.INFINITE);
            bar.startAnimation(anim);
        }

        private void clearWaveAnimation(View bar) {
            if (bar != null) {
                bar.clearAnimation();
            }
        }
    }
}
