import React, { useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  ListTodo,
  Plus,
  Trash2,
} from 'lucide-react';
import type { TaskItem } from '../types/jarvis';

interface TasksPanelProps {
  tasks: TaskItem[];
  onAddTask: (
    title: string,
    priority: TaskItem['priority'],
    dueDate?: string
  ) => Promise<void>;
  onToggleTask: (id: string, completed: boolean) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  isAuthenticated: boolean;
  compact?: boolean;
  onViewAll?: () => void;
}

export const TasksPanel: React.FC<TasksPanelProps> = ({
  tasks,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  isAuthenticated,
  compact = false,
  onViewAll,
}) => {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskItem['priority']>('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const remaining = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.length - remaining;
  const pct =
    tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const displayedTasks = compact
    ? [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed)).slice(0, 3)
    : tasks;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddTask(title.trim(), priority, dueDate || undefined);
      setTitle('');
      setDueDate('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-emerald-500/25 bg-white/95 dark:bg-[#050A12]/95 backdrop-blur-md p-4 flex flex-col shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ListTodo className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h2 className="font-display text-xs sm:text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 truncate">
            TODAY&apos;S TASKS ·{' '}
            <span className="font-mono-hud text-emerald-700 dark:text-emerald-300">
              {remaining} LEFT
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono-hud text-[11px] text-slate-500 dark:text-slate-400">
            {pct}%
          </span>
          {compact && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="min-h-[34px] px-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>View All</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800/90 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Quick Add Bar */}
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              isAuthenticated
                ? 'Quick add task or ask J.A.R.V.I.S...'
                : 'Sign in with Google to sync tasks...'
            }
            disabled={!isAuthenticated || submitting}
            maxLength={300}
            className="flex-1 min-w-0 min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#040811] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!isAuthenticated || !title.trim() || submitting}
            aria-label="Add task"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 font-semibold hover:bg-emerald-500 dark:hover:bg-emerald-300 transition-colors disabled:opacity-40 shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {!compact && (
          <div className="flex items-center gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskItem['priority'])}
              aria-label="Task priority"
              className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-2.5 text-xs text-slate-700 dark:text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
              className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-2.5 text-xs text-slate-700 dark:text-slate-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        )}
      </form>

      {/* Task List */}
      <div className={`mt-3 space-y-2 ${compact ? '' : 'max-h-64 overflow-y-auto pr-1'}`}>
        {displayedTasks.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center">
            {isAuthenticated
              ? 'No active tasks yet. Add one above or ask J.A.R.V.I.S.'
              : 'Sign in with Google above to manage and persist your daily tasks.'}
          </p>
        ) : (
          displayedTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#050A14] px-3 py-2"
            >
              <button
                type="button"
                onClick={() => onToggleTask(task.id, !task.completed)}
                className="flex items-center gap-2.5 text-left flex-1 min-w-0 min-h-[36px]"
              >
                {task.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-cyan-600/80 dark:text-cyan-400/70 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs truncate ${
                      task.completed
                        ? 'line-through text-slate-400 dark:text-slate-500'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="capitalize">{task.priority}</span>
                    {task.dueDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-mono-hud">
                          <CalendarClock className="w-3 h-3" />
                          {task.dueDate}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDeleteTask(task.id)}
                aria-label={`Remove task ${task.title}`}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
