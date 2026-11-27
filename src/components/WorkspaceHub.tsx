import React, { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  Calculator,
  Calendar,
  Camera,
  CheckSquare,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  HardDrive,
  Image,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  Video,
  Youtube,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ConfirmDialogState, NoteItem } from '../types/jarvis';
import {
  CalendarEventItem,
  ContactPerson,
  createCalendarEvent,
  createGmailDraft,
  createGoogleMeetSpace,
  createGoogleTask,
  deleteCalendarEvent,
  DriveFileItem,
  fetchCalendarEvents,
  fetchContacts,
  fetchDriveFiles,
  fetchGmailMessages,
  fetchGoogleChatSpaces,
  fetchGoogleTasks,
  GmailSummary,
  GoogleTaskItem,
  readWorkspaceFilePreview,
  sendGmailMessage,
} from '../lib/workspaceApi';

interface WorkspaceHubProps {
  accessToken: string | null;
  user: User | null;
  notes: NoteItem[];
  onGoogleSignIn: () => Promise<void>;
  onAddNote: (title: string, content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onSummarizeWithJarvis: (text: string) => void;
  onRequestConfirm: (dialog: ConfirmDialogState) => void;
  onStartAlarm: (label: string, minutes: number) => void;
  onRunDeviceAction?: (target: string, query?: string) => void;
}

type WorkspaceTab =
  | 'gmail'
  | 'calendar'
  | 'drive'
  | 'tasks_meet_chat'
  | 'contacts_notes'
  | 'actions';

export const WorkspaceHub: React.FC<WorkspaceHubProps> = ({
  accessToken,
  user,
  notes,
  onGoogleSignIn,
  onAddNote,
  onDeleteNote,
  onSummarizeWithJarvis,
  onRequestConfirm,
  onStartAlarm,
  onRunDeviceAction,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('gmail');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Gmail state
  const [emails, setEmails] = useState<GmailSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [gmailQuery, setGmailQuery] = useState('');
  const [mailTo, setMailTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');

  // Calendar state
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [evSummary, setEvSummary] = useState('');
  const [evStart, setEvStart] = useState('');
  const [evEnd, setEvEnd] = useState('');

  // Drive state
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [driveQuery, setDriveQuery] = useState('');
  const [filePreview, setFilePreview] = useState<{
    name: string;
    content: string;
  } | null>(null);

  // Google Tasks, Meet, Chat state
  const [gTasks, setGTasks] = useState<GoogleTaskItem[]>([]);
  const [newGTask, setNewGTask] = useState('');
  const [meetInfo, setMeetInfo] = useState<{
    meetingUri: string;
    meetingCode: string;
  } | null>(null);
  const [chatSpaces, setChatSpaces] = useState<
    Array<{ name: string; displayName?: string; spaceType?: string }>
  >([]);
  const [chatNotice, setChatNotice] = useState<string | null>(null);

  // Contacts & Notes state
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Device actions state
  const [ytQuery, setYtQuery] = useState('');
  const [browserUrl, setBrowserUrl] = useState('https://');
  const [phoneInput, setPhoneInput] = useState('');
  const [alarmLabel, setAlarmLabel] = useState('Standup Briefing');
  const [alarmMinutes, setAlarmMinutes] = useState(5);

  const loadTabData = useCallback(
    async (tab: WorkspaceTab) => {
      if (!accessToken) return;
      setLoading(true);
      setErrorMsg(null);
      setStatusMessage(null);
      try {
        if (tab === 'gmail') {
          const res = await fetchGmailMessages(accessToken, gmailQuery, 10);
          setEmails(res.messages);
          setUnreadCount(res.unreadCount);
        } else if (tab === 'calendar') {
          const list = await fetchCalendarEvents(accessToken, 12);
          setEvents(list);
        } else if (tab === 'drive') {
          const list = await fetchDriveFiles(accessToken, driveQuery);
          setFiles(list);
        } else if (tab === 'tasks_meet_chat') {
          const tasksRes = await fetchGoogleTasks(accessToken);
          setGTasks(tasksRes);
          try {
            const chatRes = await fetchGoogleChatSpaces(accessToken);
            setChatSpaces(chatRes.spaces || []);
            setChatNotice(null);
          } catch (chatErr) {
            setChatSpaces([]);
            setChatNotice(
              chatErr instanceof Error
                ? `${chatErr.message} — Google Chat API requires a Google Workspace organization account and Chat App configuration in Google Cloud Console.`
                : 'Google Chat API unavailable for this account.'
            );
          }
        } else if (tab === 'contacts_notes') {
          const people = await fetchContacts(accessToken);
          setContacts(people);
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Failed to load Workspace data.'
        );
      } finally {
        setLoading(false);
      }
    },
    [accessToken, gmailQuery, driveQuery]
  );

  useEffect(() => {
    if (accessToken && activeTab !== 'actions') {
      loadTabData(activeTab);
    }
  }, [accessToken, activeTab, loadTabData]);

  const handleCreateDraft = async () => {
    if (!accessToken || !mailTo.trim() || !mailSubject.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await createGmailDraft(
        accessToken,
        mailTo.trim(),
        mailSubject.trim(),
        mailBody
      );
      setStatusMessage('Email draft saved to your Gmail Drafts folder.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to create draft.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSendMail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !mailTo.trim() || !mailSubject.trim()) return;
    onRequestConfirm({
      open: true,
      title: 'Confirm Email Dispatch',
      description: `Send email via Gmail to:\n${mailTo.trim()}\n\nSubject: ${mailSubject.trim()}\n\nBody preview:\n${mailBody.slice(0, 240)}`,
      confirmLabel: 'Send Email',
      variant: 'primary',
      onConfirm: async () => {
        await sendGmailMessage(
          accessToken,
          mailTo.trim(),
          mailSubject.trim(),
          mailBody
        );
        setMailTo('');
        setMailSubject('');
        setMailBody('');
        setStatusMessage('Email transmitted via Gmail.');
        await loadTabData('gmail');
      },
    });
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !evSummary.trim() || !evStart || !evEnd) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await createCalendarEvent(accessToken, evSummary.trim(), evStart, evEnd);
      setEvSummary('');
      setEvStart('');
      setEvEnd('');
      setStatusMessage('Calendar event created.');
      await loadTabData('calendar');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to create event.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeleteEvent = (ev: CalendarEventItem) => {
    if (!accessToken) return;
    onRequestConfirm({
      open: true,
      title: 'Delete Calendar Event',
      description: `Permanently delete "${ev.summary}" (${ev.start}) from your primary Google Calendar?`,
      confirmLabel: 'Delete Event',
      variant: 'danger',
      onConfirm: async () => {
        await deleteCalendarEvent(accessToken, ev.id);
        setStatusMessage(`Removed event "${ev.summary}".`);
        await loadTabData('calendar');
      },
    });
  };

  const handlePreviewFile = async (file: DriveFileItem) => {
    if (!accessToken) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const content = await readWorkspaceFilePreview(accessToken, file);
      setFilePreview({ name: file.name, content });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to preview file.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddGoogleTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !newGTask.trim()) return;
    setLoading(true);
    try {
      await createGoogleTask(accessToken, newGTask.trim());
      setNewGTask('');
      await loadTabData('tasks_meet_chat');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to create Google Task.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMeet = async () => {
    if (!accessToken) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const space = await createGoogleMeetSpace(accessToken);
      setMeetInfo(space);
      setStatusMessage('Instant Google Meet link generated.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to create Meet space.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    await onAddNote(noteTitle.trim(), noteContent.trim());
    setNoteTitle('');
    setNoteContent('');
  };

  const handleSafeOpenUrl = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        setErrorMsg('Only http:// and https:// URLs are permitted.');
        return;
      }
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      setErrorMsg('Please enter a valid web URL starting with https://');
    }
  };

  const handleDialNumber = (rawPhone: string) => {
    const cleaned = rawPhone.replace(/[^\d+*#()-]/g, '').trim();
    if (!cleaned) {
      setErrorMsg('Enter a valid phone number.');
      return;
    }
    onRequestConfirm({
      open: true,
      title: 'Confirm Phone Call Intent',
      description: `Launch your device dialer to call ${cleaned}?`,
      confirmLabel: 'Call Number',
      variant: 'primary',
      onConfirm: () => {
        window.location.href = `tel:${cleaned}`;
      },
    });
  };

  const tabs: Array<{
    id: WorkspaceTab;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'gmail', label: 'Gmail', icon: <Mail className="w-3.5 h-3.5" /> },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: <Calendar className="w-3.5 h-3.5" />,
    },
    {
      id: 'drive',
      label: 'Drive & Docs',
      icon: <HardDrive className="w-3.5 h-3.5" />,
    },
    {
      id: 'tasks_meet_chat',
      label: 'Tasks, Meet & Chat',
      icon: <Video className="w-3.5 h-3.5" />,
    },
    {
      id: 'contacts_notes',
      label: 'Contacts & Notes',
      icon: <Users className="w-3.5 h-3.5" />,
    },
    {
      id: 'actions',
      label: 'Device Actions',
      icon: <Globe className="w-3.5 h-3.5" />,
    },
  ];

  const needsGoogleAuth =
    activeTab !== 'actions' &&
    !(activeTab === 'contacts_notes' && user && !accessToken) &&
    !accessToken;

  const cardCls =
    'rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-4 sm:p-5 shadow-sm';
  const subCardCls =
    'rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14]';
  const inputCls =
    'w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <FolderOpen className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span>Workspace & Action Hub</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Tasks, Meet, Contacts, Notes & Real Device/Web Actions.
          </p>
        </div>

        {accessToken && activeTab !== 'actions' && (
          <button
            type="button"
            onClick={() => loadTabData(activeTab)}
            disabled={loading}
            className="min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500/50 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setStatusMessage(null);
              setActiveTab(t.id);
            }}
            className={`min-h-[42px] px-3.5 rounded-xl text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors shrink-0 ${
              activeTab === t.id
                ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold'
                : 'bg-white dark:bg-[#08101E] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/40'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/25 px-4 py-2.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/25 px-4 py-2.5 text-xs sm:text-sm text-rose-800 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Auth Gate for Google Workspace APIs */}
      {needsGoogleAuth ? (
        <div className="rounded-2xl border border-slate-200 dark:border-cyan-500/30 bg-white dark:bg-[#08101E]/90 p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <p className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Connect Google Workspace
          </p>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {user
              ? 'Your Google Workspace OAuth session expired on page reload (tokens are kept strictly in memory for security). Re-authorize to sync Gmail, Calendar, Drive, Tasks, Meet, and Contacts.'
              : 'Sign in with Google to read and manage your real Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Tasks, Meet, and Contacts.'}
          </p>
          <button
            type="button"
            onClick={onGoogleSignIn}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors"
          >
            {user ? 'Reconnect Google Workspace' : 'Sign in with Google'}
          </button>
        </div>
      ) : (
        <>
          {/* GMAIL TAB */}
          {activeTab === 'gmail' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className={`lg:col-span-7 ${cardCls} space-y-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Inbox ({unreadCount} unread)
                  </h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      loadTabData('gmail');
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={gmailQuery}
                      onChange={(e) => setGmailQuery(e.target.value)}
                      placeholder="Filter Gmail (e.g. from:boss)..."
                      className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="min-h-[38px] px-3 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700"
                    >
                      Search
                    </button>
                  </form>
                </div>

                {loading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400 animate-spin" />
                  </div>
                ) : emails.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                    No messages matched your query.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {emails.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-xl border p-3.5 bg-slate-50 dark:bg-[#050A14] ${
                          msg.unread
                            ? 'border-cyan-500/45'
                            : 'border-slate-200 dark:border-slate-800/90'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {msg.subject}
                          </p>
                          {msg.unread && (
                            <span className="text-[10px] font-mono-hud text-cyan-700 dark:text-cyan-300 shrink-0">
                              UNREAD
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {msg.from}
                        </p>
                        <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                          {msg.snippet}
                        </p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onSummarizeWithJarvis(
                                `Summarize this email and suggest a concise reply:\nFrom: ${msg.from}\nSubject: ${msg.subject}\nSnippet: ${msg.snippet}`
                              )
                            }
                            className="min-h-[32px] px-2.5 rounded-lg border border-cyan-500/35 text-[11px] text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10 inline-flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Summarize with J.A.R.V.I.S</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form
                onSubmit={handleRequestSendMail}
                className={`lg:col-span-5 ${cardCls} space-y-3`}
              >
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Compose Email
                </h2>
                <input
                  type="email"
                  required
                  value={mailTo}
                  onChange={(e) => setMailTo(e.target.value)}
                  placeholder="Recipient (to@example.com)"
                  className={inputCls}
                />
                <input
                  type="text"
                  required
                  value={mailSubject}
                  onChange={(e) => setMailSubject(e.target.value)}
                  placeholder="Subject"
                  className={inputCls}
                />
                <textarea
                  rows={5}
                  value={mailBody}
                  onChange={(e) => setMailBody(e.target.value)}
                  placeholder="Write your email body..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={loading || !mailTo.trim() || !mailSubject.trim()}
                    className="min-h-[42px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    Save Draft
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !mailTo.trim() || !mailSubject.trim()}
                    className="min-h-[42px] px-4 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Review & Send</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* CALENDAR TAB */}
          {activeTab === 'calendar' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className={`lg:col-span-7 ${cardCls} space-y-3`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Upcoming Schedule
                  </h2>
                  {events.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onSummarizeWithJarvis(
                          `Brief me on my upcoming schedule:\n${events
                            .map((ev) => `- ${ev.summary} (${ev.start})`)
                            .join('\n')}`
                        )
                      }
                      className="min-h-[34px] px-3 rounded-lg border border-cyan-500/35 text-xs text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10 inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Brief Schedule</span>
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400 animate-spin" />
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                    No upcoming events found on your primary calendar.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    {events.map((ev) => (
                      <div
                        key={ev.id}
                        className={`flex items-start justify-between gap-3 ${subCardCls} p-3.5`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {ev.summary}
                          </p>
                          <p className="mt-1 font-mono-hud text-[11px] text-cyan-700 dark:text-cyan-300">
                            {new Date(ev.start).toLocaleString()}
                          </p>
                          {ev.location && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                              {ev.location}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRequestDeleteEvent(ev)}
                          aria-label={`Delete ${ev.summary}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form
                onSubmit={handleCreateEvent}
                className={`lg:col-span-5 ${cardCls} space-y-3`}
              >
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Schedule Event
                </h2>
                <input
                  type="text"
                  required
                  value={evSummary}
                  onChange={(e) => setEvSummary(e.target.value)}
                  placeholder="Event title"
                  className={inputCls}
                />
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={evStart}
                    onChange={(e) => setEvStart(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={evEnd}
                    onChange={(e) => setEvEnd(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-300"
                >
                  Create Calendar Event
                </button>
              </form>
            </div>
          )}

          {/* DRIVE & DOCS TAB */}
          {activeTab === 'drive' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className={`lg:col-span-6 ${cardCls} space-y-4`}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    loadTabData('drive');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={driveQuery}
                    onChange={(e) => setDriveQuery(e.target.value)}
                    placeholder="Search Drive, Docs, Sheets, Slides, Forms..."
                    className={`flex-1 ${inputCls}`}
                  />
                  <button
                    type="submit"
                    className="min-h-[42px] px-4 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-xs"
                  >
                    Search
                  </button>
                </form>

                {loading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400 animate-spin" />
                  </div>
                ) : files.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                    No files found in Google Drive.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {files.map((f) => (
                      <div
                        key={f.id}
                        className={`flex items-center justify-between gap-2 ${subCardCls} px-3.5 py-2.5`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {f.name}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {f.mimeType.replace('application/vnd.google-apps.', 'Google ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handlePreviewFile(f)}
                            className="min-h-[34px] px-2.5 rounded-lg border border-cyan-500/35 text-[11px] text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10 inline-flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Read</span>
                          </button>
                          {f.webViewLink && (
                            <a
                              href={f.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open ${f.name}`}
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-300"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`lg:col-span-6 ${cardCls} flex flex-col`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {filePreview ? filePreview.name : 'Document Preview'}
                  </h2>
                  {filePreview && (
                    <button
                      type="button"
                      onClick={() =>
                        onSummarizeWithJarvis(
                          `Summarize this file "${filePreview.name}":\n${filePreview.content}`
                        )
                      }
                      className="min-h-[34px] px-3 rounded-lg bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Summarize</span>
                    </button>
                  )}
                </div>
                <div className={`flex-1 min-h-[260px] max-h-[380px] overflow-y-auto ${subCardCls} p-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap`}>
                  {filePreview
                    ? filePreview.content
                    : 'Select a Google Doc, Sheet, Slide deck, or Form on the left to inspect its contents.'}
                </div>
              </div>
            </div>
          )}

          {/* TASKS, MEET & CHAT TAB */}
          {activeTab === 'tasks_meet_chat' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Google Tasks */}
              <div className={`${cardCls} space-y-3`}>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Google Tasks</span>
                </h2>
                <form onSubmit={handleAddGoogleTask} className="flex gap-2">
                  <input
                    type="text"
                    value={newGTask}
                    onChange={(e) => setNewGTask(e.target.value)}
                    placeholder="Add to Google Tasks..."
                    className={`flex-1 ${inputCls}`}
                  />
                  <button
                    type="submit"
                    className="min-h-[40px] px-3 rounded-xl bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 font-semibold text-xs"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </form>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {gTasks.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No Google Tasks found.</p>
                  ) : (
                    gTasks.map((t) => (
                      <div
                        key={t.id}
                        className={`${subCardCls} px-3 py-2 text-xs text-slate-800 dark:text-slate-200`}
                      >
                        <p className={t.status === 'completed' ? 'line-through text-slate-400 dark:text-slate-500' : ''}>
                          {t.title}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Google Meet */}
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Video className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>Google Meet</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Provision a live Google Meet video room instantly using your authorized account.
                </p>
                <button
                  type="button"
                  onClick={handleCreateMeet}
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-300"
                >
                  Create Instant Meet Room
                </button>
                {meetInfo && (
                  <div className="rounded-xl border border-emerald-500/35 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-2">
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      Meeting Code:{' '}
                      <span className="font-mono-hud text-emerald-700 dark:text-emerald-300">
                        {meetInfo.meetingCode}
                      </span>
                    </p>
                    <a
                      href={meetInfo.meetingUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-cyan-700 dark:text-cyan-300 underline"
                    >
                      <span>Join Google Meet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Google Chat */}
              <div className={`${cardCls} space-y-3`}>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  <span>Google Chat Spaces</span>
                </h2>
                {chatNotice ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                    <p>{chatNotice}</p>
                    <a
                      href="https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=jarvis-881a1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline text-amber-800 dark:text-amber-300"
                    >
                      <span>Configure Chat App in Cloud Console</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : chatSpaces.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No Google Chat spaces available.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {chatSpaces.map((s) => (
                      <div
                        key={s.name}
                        className={`${subCardCls} p-3 text-xs text-slate-800 dark:text-slate-200`}
                      >
                        <p className="font-medium">{s.displayName || s.name}</p>
                        <p className="text-[11px] text-slate-500">{s.spaceType}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTACTS & NOTES TAB */}
          {activeTab === 'contacts_notes' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Contacts */}
              <div className={`${cardCls} space-y-3`}>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>Google Contacts</span>
                </h2>
                {!accessToken ? (
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="min-h-[42px] px-4 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 text-xs font-semibold"
                  >
                    Authorize Contacts Access
                  </button>
                ) : contacts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No contacts returned.</p>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {contacts.map((c) => (
                      <div
                        key={c.resourceName}
                        className={`flex items-center justify-between gap-3 ${subCardCls} p-3`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {c.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {c.email || c.phone || 'No contact info'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.phone && (
                            <button
                              type="button"
                              onClick={() => handleDialNumber(c.phone!)}
                              aria-label={`Call ${c.name}`}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {c.email && (
                            <button
                              type="button"
                              onClick={() => {
                                setMailTo(c.email!);
                                setActiveTab('gmail');
                              }}
                              aria-label={`Email ${c.name}`}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-cyan-500/35 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Personal Cloud Notes (Firestore) */}
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  <span>Personal Notes</span>
                </h2>
                <form onSubmit={handleAddLocalNote} className="space-y-2.5">
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    disabled={!user}
                    placeholder="Note title..."
                    className={`${inputCls} disabled:opacity-50`}
                  />
                  <textarea
                    rows={2}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    disabled={!user}
                    placeholder="Write a quick note..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!user || !noteTitle.trim() || !noteContent.trim()}
                    className="min-h-[40px] px-4 rounded-xl bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-950 font-semibold text-xs hover:bg-amber-400 dark:hover:bg-amber-300 disabled:opacity-40"
                  >
                    Save Note
                  </button>
                </form>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {notes.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user
                        ? 'No saved notes yet.'
                        : 'Sign in with Google to sync your personal notes.'}
                    </p>
                  ) : (
                    notes.map((n) => (
                      <div
                        key={n.id}
                        className={`${subCardCls} p-3 flex items-start justify-between gap-2`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {n.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                            {n.content}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteNote(n.id)}
                          aria-label={`Delete note ${n.title}`}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DEVICE & WEB ACTIONS TAB */}
          {activeTab === 'actions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                  <span>App, Tool & Media Launchers</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Launches real web apps, Android deep-link intents, and built-in device tools (Camera, Gallery, Calculator). Hardware toggles (Wi-Fi / Bluetooth) are sandbox-restricted by browsers.
                </p>

                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'youtube', label: 'YouTube' },
                    { id: 'instagram', label: 'Instagram' },
                    { id: 'facebook', label: 'Facebook' },
                    { id: 'whatsapp', label: 'WhatsApp' },
                    { id: 'browser', label: 'Chrome / Web' },
                    { id: 'maps', label: 'Google Maps' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        onRunDeviceAction
                          ? onRunDeviceAction(item.id)
                          : handleSafeOpenUrl(`https://www.${item.id === 'browser' ? 'google' : item.id}.com`)
                      }
                      className="min-h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#050A14] text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-cyan-500/50"
                    >
                      Open {item.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => onRunDeviceAction?.('camera')}
                    className="min-h-[40px] px-3.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs font-medium text-cyan-800 dark:text-cyan-200 inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRunDeviceAction?.('gallery')}
                    className="min-h-[40px] px-3.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs font-medium text-cyan-800 dark:text-cyan-200 inline-flex items-center gap-1.5"
                  >
                    <Image className="w-3.5 h-3.5" />
                    <span>Gallery</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRunDeviceAction?.('calculator')}
                    className="min-h-[40px] px-3.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs font-medium text-cyan-800 dark:text-cyan-200 inline-flex items-center gap-1.5"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Calculator</span>
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!ytQuery.trim()) return;
                    if (onRunDeviceAction) {
                      onRunDeviceAction('youtube', ytQuery.trim());
                    } else {
                      handleSafeOpenUrl(
                        `https://www.youtube.com/results?search_query=${encodeURIComponent(
                          ytQuery.trim()
                        )}`
                      );
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={ytQuery}
                    onChange={(e) => setYtQuery(e.target.value)}
                    placeholder="Search & play on YouTube..."
                    className={`flex-1 ${inputCls}`}
                  />
                  <button
                    type="submit"
                    className="min-h-[42px] px-4 rounded-xl bg-rose-500 text-white font-semibold text-xs hover:bg-rose-400"
                  >
                    Play
                  </button>
                </form>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSafeOpenUrl(browserUrl);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="url"
                    value={browserUrl}
                    onChange={(e) => setBrowserUrl(e.target.value)}
                    placeholder="https://example.com"
                    className={`flex-1 ${inputCls}`}
                  />
                  <button
                    type="submit"
                    className="min-h-[42px] px-4 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-xs"
                  >
                    Open URL
                  </button>
                </form>
              </div>

              <div className={`${cardCls} space-y-5`}>
                <div className="space-y-3">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Dialer Intent</span>
                  </h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleDialNumber(phoneInput);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+1 555 0100"
                      className={`flex-1 ${inputCls}`}
                    />
                    <button
                      type="submit"
                      className="min-h-[42px] px-4 rounded-xl bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 font-semibold text-xs hover:bg-emerald-500 dark:hover:bg-emerald-300"
                    >
                      Call
                    </button>
                  </form>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <BellRing className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    <span>In-App Alarm / Countdown Timer</span>
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={alarmLabel}
                      onChange={(e) => setAlarmLabel(e.target.value)}
                      placeholder="Alarm label"
                      className={`flex-1 ${inputCls}`}
                    />
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={alarmMinutes}
                      onChange={(e) => setAlarmMinutes(Number(e.target.value) || 1)}
                      className="w-24 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onStartAlarm(
                          alarmLabel.trim() || 'J.A.R.V.I.S Timer',
                          Math.max(1, alarmMinutes)
                        )
                      }
                      className="min-h-[42px] px-4 rounded-xl bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-950 font-semibold text-xs hover:bg-amber-400 dark:hover:bg-amber-300"
                    >
                      Start Timer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
