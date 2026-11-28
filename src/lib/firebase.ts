import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  ChatMessage,
  MemoryItem,
  NoteItem,
  SoulConfig,
  TaskItem,
  VoiceSettings,
} from '../types/jarvis';

const app = initializeApp(firebaseConfig);
const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || '(default)';

function createFirestoreInstance() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/contacts.readonly',
];

// Basic sign-in: only name + email. Works for any Google account without
// Google app verification.
const basicProvider = new GoogleAuthProvider();
basicProvider.setCustomParameters({ prompt: 'select_account' });

// Workspace sign-in: asks for Gmail/Calendar/Drive/etc. Only used when the
// user taps "Connect Google" inside the Workspace screen.
const workspaceProvider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => workspaceProvider.addScope(scope));
workspaceProvider.setCustomParameters({ prompt: 'select_account' });

function friendlyAuthError(err: unknown): Error {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return new Error(
        'Is website ka domain Firebase me authorized nahi hai. Firebase Console > Authentication > Settings > Authorized domains me apna Render domain add karo.'
      );
    case 'auth/internal-error':
    case 'auth/configuration-not-found':
      return new Error(
        'Firebase login set up nahi hai. Firebase Console > Authentication > Get started dabao, phir Sign-in method > Google ko Enable karo. Phir 2-3 minute baad dobara try karo.'
      );
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return new Error(
        'Firebase API key galat hai. firebase-applet-config.json me apiKey check karo.'
      );
    case 'auth/operation-not-allowed':
      return new Error(
        'Google sign-in Firebase me enable nahi hai. Firebase Console > Authentication > Sign-in method > Google ko Enable karo.'
      );
    case 'auth/popup-blocked':
      return new Error(
        'Browser ne sign-in popup block kiya. Popups allow karke dobara try karo.'
      );
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new Error('Sign-in cancel ho gaya. Dobara try karo.');
    case 'auth/network-request-failed':
      return new Error('Internet connection check karo aur dobara try karo.');
    case 'auth/web-storage-unsupported':
      return new Error(
        'Is browser/WebView me sign-in supported nahi hai. Chrome me app kholo.'
      );
    default:
      return err instanceof Error ? err : new Error('Google Sign-In failed.');
  }
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isTransientOfflineError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg = error instanceof Error ? error.message : String(error || '');
  return (
    code === 'unavailable' ||
    msg.includes('the client is offline') ||
    msg.includes('Could not reach Cloud Firestore backend') ||
    msg.includes('Failed to get document because the client is offline')
  );
}

// Validate Firestore connectivity on app boot
export async function testConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const attempt = async (): Promise<boolean> => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      return true;
    } catch (error) {
      if (isTransientOfflineError(error)) {
        return false;
      }
      return true;
    }
  };

  const firstOk = await attempt();
  if (firstOk) return true;

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const secondOk = await attempt();
  if (!secondOk) {
    console.error('Please check your Firebase configuration.');
  }
  return secondOk;
}
testConnection();

export function initAuth(
  onUserChange: (user: User | null, accessToken: string | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      onUserChange(user, cachedAccessToken);
      if (!isSigningIn) {
        void ensureUserRootDoc(user).catch((err) => {
          if (!isTransientOfflineError(err)) {
            console.error('ensureUserRootDoc error:', err);
          }
        });
      }
    } else {
      cachedAccessToken = null;
      onUserChange(null, null);
    }
  });
}

export async function googleSignIn(withWorkspace = false): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(
      auth,
      withWorkspace ? workspaceProvider : basicProvider
    );
    if (withWorkspace) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      cachedAccessToken = credential?.accessToken ?? null;
    }
    await ensureUserRootDoc(result.user);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    throw friendlyAuthError(err);
  } finally {
    isSigningIn = false;
  }
}

export async function logout() {
  await auth.signOut();
  cachedAccessToken = null;
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

let pendingRootRetryListener: (() => void) | null = null;

export async function ensureUserRootDoc(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    const email = (user.email || 'user@example.com').slice(0, 256);
    const displayName = (user.displayName || email.split('@')[0] || 'User').slice(0, 120);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        email,
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (isTransientOfflineError(error)) {
      console.warn(
        'Firestore temporarily offline while syncing user profile; will retry when online.'
      );
      if (typeof window !== 'undefined' && !pendingRootRetryListener) {
        pendingRootRetryListener = () => {
          if (pendingRootRetryListener) {
            window.removeEventListener('online', pendingRootRetryListener);
            pendingRootRetryListener = null;
          }
          const current = auth.currentUser;
          if (current && current.uid === user.uid) {
            void ensureUserRootDoc(current).catch(() => {});
          }
        };
        window.addEventListener('online', pendingRootRetryListener, { once: true });
      }
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

// Memories CRUD
export function subscribeMemories(
  uid: string,
  onData: (items: MemoryItem[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/memories`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('updatedAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MemoryItem, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function addMemory(
  uid: string,
  content: string,
  category: MemoryItem['category'] = 'fact',
  importance: MemoryItem['importance'] = 'medium'
): Promise<string> {
  const clean = content.trim().slice(0, 2000);
  if (!clean) throw new Error('Memory content cannot be empty.');
  const id = makeDocId('mem');
  const docPath = `users/${uid}/memories/${id}`;
  try {
    await setDoc(doc(db, docPath), {
      userId: uid,
      content: clean,
      category,
      importance,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateMemory(
  uid: string,
  id: string,
  content: string,
  category: MemoryItem['category'],
  importance: MemoryItem['importance']
): Promise<void> {
  const clean = content.trim().slice(0, 2000);
  if (!clean) throw new Error('Memory content cannot be empty.');
  const docPath = `users/${uid}/memories/${id}`;
  try {
    await updateDoc(doc(db, docPath), {
      content: clean,
      category,
      importance,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteMemory(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/memories/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// Tasks CRUD
export function subscribeTasks(
  uid: string,
  onData: (items: TaskItem[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/tasks`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TaskItem, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function addTask(
  uid: string,
  title: string,
  priority: TaskItem['priority'] = 'medium',
  dueDate?: string,
  reminderAt?: string
): Promise<string> {
  const clean = title.trim().slice(0, 300);
  if (!clean) throw new Error('Task title cannot be empty.');
  const id = makeDocId('task');
  const docPath = `users/${uid}/tasks/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    title: clean,
    completed: false,
    priority,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (dueDate && dueDate.trim()) payload.dueDate = dueDate.trim().slice(0, 32);
  if (reminderAt && reminderAt.trim())
    payload.reminderAt = reminderAt.trim().slice(0, 64);

  try {
    await setDoc(doc(db, docPath), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function toggleTask(
  uid: string,
  id: string,
  completed: boolean
): Promise<void> {
  const docPath = `users/${uid}/tasks/${id}`;
  try {
    await updateDoc(doc(db, docPath), {
      completed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteTask(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/tasks/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// Messages CRUD
export function subscribeMessages(
  uid: string,
  onData: (items: ChatMessage[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/messages`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('createdAt', 'asc'),
    limit(120)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatMessage, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function addMessage(
  uid: string,
  role: 'user' | 'assistant',
  text: string,
  language?: string,
  modelUsed?: string
): Promise<string> {
  const clean = text.trim().slice(0, 12000);
  if (!clean) throw new Error('Message text cannot be empty.');
  const id = makeDocId('msg');
  const docPath = `users/${uid}/messages/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    role,
    text: clean,
    createdAt: serverTimestamp(),
  };
  if (language) payload.language = language.slice(0, 32);
  if (modelUsed) payload.modelUsed = modelUsed.slice(0, 64);

  try {
    await setDoc(doc(db, docPath), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function clearMessages(uid: string): Promise<void> {
  const colPath = `users/${uid}/messages`;
  try {
    const snap = await getDocs(
      query(collection(db, colPath), where('userId', '==', uid), limit(200))
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, colPath);
  }
}

// Notes CRUD
export function subscribeNotes(
  uid: string,
  onData: (items: NoteItem[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/notes`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NoteItem, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function addNote(
  uid: string,
  title: string,
  content: string
): Promise<string> {
  const cleanTitle = title.trim().slice(0, 200);
  const cleanContent = content.trim().slice(0, 6000);
  if (!cleanTitle || !cleanContent)
    throw new Error('Note title and content are required.');
  const id = makeDocId('note');
  const docPath = `users/${uid}/notes/${id}`;
  try {
    await setDoc(doc(db, docPath), {
      userId: uid,
      title: cleanTitle,
      content: cleanContent,
      pinned: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deleteNote(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/notes/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// Settings (SOUL & Voice)
export async function loadSettings(
  uid: string
): Promise<{ soul?: SoulConfig; voice?: VoiceSettings }> {
  const docPath = `users/${uid}/settings/soul`;
  try {
    const snap = await getDoc(doc(db, docPath));
    if (!snap.exists()) return {};
    const d = snap.data();
    return {
      soul: {
        assistantName: d.assistantName || 'J.A.R.V.I.S.',
        addressTitle: d.addressTitle || 'Sir',
        personalityTone:
          d.personalityTone ||
          'Intelligent, professional, polite, helpful, and subtly witty.',
        languages: Array.isArray(d.languages)
          ? d.languages
          : ['English', 'Hindi', 'Urdu'],
        customDirectives: d.customDirectives || '',
      },
      voice: {
        voiceEngine: d.voiceEngine === 'gemini' ? 'gemini' : 'elevenlabs',
        geminiVoiceName: d.geminiVoiceName || 'Charon',
        elevenLabsVoiceId: d.elevenLabsVoiceId || 'uuyFQegRan8rpIQCGu9K',
        stability: typeof d.stability === 'number' ? d.stability : 0.5,
        similarity: typeof d.similarity === 'number' ? d.similarity : 0.75,
        speed: typeof d.speed === 'number' ? d.speed : 1.0,
        autoSpeak: typeof d.autoSpeak === 'boolean' ? d.autoSpeak : true,
        wakeWordEnabled:
          typeof d.wakeWordEnabled === 'boolean' ? d.wakeWordEnabled : false,
        themeMode:
          d.themeMode === 'dark' || d.themeMode === 'light' || d.themeMode === 'system'
            ? d.themeMode
            : undefined,
        modelMode:
          d.modelMode === 'fast' || d.modelMode === 'balanced' || d.modelMode === 'deep'
            ? d.modelMode
            : 'fast',
        showLatencyTelemetry:
          typeof d.showLatencyTelemetry === 'boolean'
            ? d.showLatencyTelemetry
            : undefined,
        keepScreenAwake:
          typeof d.keepScreenAwake === 'boolean' ? d.keepScreenAwake : undefined,
      },
    };
  } catch (error) {
    if (isTransientOfflineError(error)) {
      console.warn('Firestore offline while loading settings; using local defaults.');
      return {};
    }
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function saveAssistantSettings(
  uid: string,
  soul: SoulConfig,
  voice: VoiceSettings
): Promise<void> {
  const docPath = `users/${uid}/settings/soul`;
  const payload: Record<string, unknown> = {
    userId: uid,
    assistantName: soul.assistantName.trim().slice(0, 64) || 'J.A.R.V.I.S.',
    addressTitle: soul.addressTitle.trim().slice(0, 40) || 'Sir',
    personalityTone: soul.personalityTone.trim().slice(0, 600),
    languages: soul.languages.filter((l) =>
      ['English', 'Hindi', 'Urdu'].includes(l)
    ).length
      ? soul.languages.filter((l) => ['English', 'Hindi', 'Urdu'].includes(l))
      : ['English', 'Hindi', 'Urdu'],
    customDirectives: soul.customDirectives.trim().slice(0, 2000),
    voiceEngine: voice.voiceEngine,
    geminiVoiceName: voice.geminiVoiceName,
    elevenLabsVoiceId:
      (voice.elevenLabsVoiceId || 'uuyFQegRan8rpIQCGu9K').trim().slice(0, 128),
    stability: Math.min(1, Math.max(0, Number(voice.stability) || 0.5)),
    similarity: Math.min(1, Math.max(0, Number(voice.similarity) || 0.75)),
    speed: Math.min(2, Math.max(0.5, Number(voice.speed) || 1.0)),
    autoSpeak: Boolean(voice.autoSpeak),
    wakeWordEnabled: Boolean(voice.wakeWordEnabled),
    themeMode:
      voice.themeMode === 'dark' ||
      voice.themeMode === 'light' ||
      voice.themeMode === 'system'
        ? voice.themeMode
        : 'system',
    modelMode:
      voice.modelMode === 'fast' ||
      voice.modelMode === 'balanced' ||
      voice.modelMode === 'deep'
        ? voice.modelMode
        : 'fast',
    showLatencyTelemetry: Boolean(voice.showLatencyTelemetry),
    keepScreenAwake: Boolean(voice.keepScreenAwake),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(doc(db, docPath));
    if (snap.exists()) {
      const { userId: _omit, ...updatePayload } = payload;
      await updateDoc(doc(db, docPath), updatePayload);
    } else {
      await setDoc(doc(db, docPath), payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
