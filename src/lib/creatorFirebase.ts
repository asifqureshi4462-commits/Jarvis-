import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  CreatorCalendarDoc,
  CreatorConnectionDoc,
  CreatorIdeaDoc,
  CreatorPostDoc,
  CreatorProjectDoc,
  CreatorReportDoc,
  CreatorScriptDoc,
  CreatorSnapshotDoc,
  SocialPlatformId,
} from '../types/creator';

function makeCreatorId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Connected Social Accounts metadata (never stores tokens or secrets)
export function subscribeCreatorConnections(
  uid: string,
  onData: (items: CreatorConnectionDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorConnections`;
  const q = query(collection(db, colPath), where('userId', '==', uid), limit(20));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CreatorConnectionDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function upsertCreatorConnection(
  uid: string,
  platform: SocialPlatformId,
  data: {
    connected: boolean;
    accountName: string;
    handle?: string;
    channelId?: string;
    avatarUrl?: string;
    followersCount?: number | null;
    notes?: string;
  }
): Promise<void> {
  const docPath = `users/${uid}/creatorConnections/${platform}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    platform,
    connected: Boolean(data.connected),
    accountName: (data.accountName || platform).trim().slice(0, 160),
    updatedAt: serverTimestamp(),
  };
  if (data.handle) payload.handle = data.handle.trim().slice(0, 160);
  if (data.channelId) payload.channelId = data.channelId.trim().slice(0, 160);
  if (data.avatarUrl) payload.avatarUrl = data.avatarUrl.trim().slice(0, 600);
  if (typeof data.followersCount === 'number' && data.followersCount >= 0) {
    payload.followersCount = data.followersCount;
  }
  if (data.notes) payload.notes = data.notes.trim().slice(0, 600);

  try {
    const snap = await getDoc(doc(db, docPath));
    if (snap.exists()) {
      const { userId: _u, platform: _p, ...updatePayload } = payload;
      await updateDoc(doc(db, docPath), updatePayload);
    } else {
      await setDoc(doc(db, docPath), payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// Historical Analytics Snapshots
export function subscribeCreatorSnapshots(
  uid: string,
  onData: (items: CreatorSnapshotDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorSnapshots`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CreatorSnapshotDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function saveCreatorSnapshot(
  uid: string,
  input: {
    platform: 'youtube' | 'instagram' | 'facebook';
    dateRange: string;
    summaryJson: string;
    views?: number | null;
    subscribers?: number | null;
    watchTimeMinutes?: number | null;
  }
): Promise<string> {
  const id = makeCreatorId('snap');
  const docPath = `users/${uid}/creatorSnapshots/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    platform: input.platform,
    dateRange: input.dateRange.slice(0, 64),
    summaryJson: input.summaryJson.slice(0, 12000),
    createdAt: serverTimestamp(),
  };
  if (typeof input.views === 'number' && input.views >= 0) payload.views = input.views;
  if (typeof input.subscribers === 'number' && input.subscribers >= 0)
    payload.subscribers = input.subscribers;
  if (typeof input.watchTimeMinutes === 'number' && input.watchTimeMinutes >= 0)
    payload.watchTimeMinutes = input.watchTimeMinutes;

  try {
    await setDoc(doc(db, docPath), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

// AI Content Ideas
export function subscribeCreatorIdeas(
  uid: string,
  onData: (items: CreatorIdeaDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorIdeas`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CreatorIdeaDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function saveCreatorIdea(
  uid: string,
  idea: Omit<CreatorIdeaDoc, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeCreatorId('idea');
  const docPath = `users/${uid}/creatorIdeas/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    topic: idea.topic.trim().slice(0, 300),
    suggestedFormat: idea.suggestedFormat.trim().slice(0, 80) || 'YouTube Video',
    confidence: ['low', 'medium', 'high'].includes(idea.confidence)
      ? idea.confidence
      : 'medium',
    status: ['saved', 'scripted', 'produced', 'archived'].includes(idea.status)
      ? idea.status
      : 'saved',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (idea.targetAudience)
    payload.targetAudience = idea.targetAudience.trim().slice(0, 240);
  if (idea.suggestedLength)
    payload.suggestedLength = idea.suggestedLength.trim().slice(0, 80);
  if (idea.hook) payload.hook = idea.hook.trim().slice(0, 600);
  if (idea.contentAngle)
    payload.contentAngle = idea.contentAngle.trim().slice(0, 1200);
  if (Array.isArray(idea.researchSources) && idea.researchSources.length > 0) {
    payload.researchSources = idea.researchSources
      .slice(0, 10)
      .map((s) => String(s).slice(0, 200));
  }
  if (idea.reason) payload.reason = idea.reason.trim().slice(0, 1200);

  try {
    await setDoc(doc(db, docPath), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateCreatorIdeaStatus(
  uid: string,
  id: string,
  status: CreatorIdeaDoc['status']
): Promise<void> {
  const docPath = `users/${uid}/creatorIdeas/${id}`;
  try {
    await updateDoc(doc(db, docPath), { status, updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteCreatorIdea(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/creatorIdeas/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// Scripts
export function subscribeCreatorScripts(
  uid: string,
  onData: (items: CreatorScriptDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorScripts`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('updatedAt', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CreatorScriptDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function saveCreatorScript(
  uid: string,
  script: Omit<CreatorScriptDoc, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || makeCreatorId('script');
  const docPath = `users/${uid}/creatorScripts/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    title: script.title.trim().slice(0, 300),
    format: script.format === 'short' ? 'short' : 'long',
    body: script.body.trim().slice(0, 24000),
    updatedAt: serverTimestamp(),
  };
  if (script.platform) payload.platform = script.platform.slice(0, 40);
  if (script.durationTarget)
    payload.durationTarget = script.durationTarget.slice(0, 40);
  if (script.hook) payload.hook = script.hook.slice(0, 1000);
  if (script.scenesJson) payload.scenesJson = script.scenesJson.slice(0, 24000);
  if (script.seoJson) payload.seoJson = script.seoJson.slice(0, 8000);
  if (script.aiProvider) payload.aiProvider = script.aiProvider.slice(0, 32);

  try {
    if (existingId) {
      const { userId: _u, ...upd } = payload;
      await updateDoc(doc(db, docPath), upd);
    } else {
      await setDoc(doc(db, docPath), { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCreatorScript(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/creatorScripts/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// Video Production Projects
export function subscribeCreatorProjects(
  uid: string,
  onData: (items: CreatorProjectDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorProjects`;
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
          ...(d.data() as Omit<CreatorProjectDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function saveCreatorProject(
  uid: string,
  proj: Omit<CreatorProjectDoc, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || makeCreatorId('proj');
  const docPath = `users/${uid}/creatorProjects/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    title: proj.title.trim().slice(0, 300),
    aspectRatio: proj.aspectRatio === '16:9' ? '16:9' : '9:16',
    status: proj.status,
    currentStep: Math.min(12, Math.max(1, Number(proj.currentStep) || 1)),
    updatedAt: serverTimestamp(),
  };
  if (proj.videoProvider) payload.videoProvider = proj.videoProvider.slice(0, 40);
  if (proj.voiceEngine) payload.voiceEngine = proj.voiceEngine.slice(0, 32);
  if (proj.pipelineJson) payload.pipelineJson = proj.pipelineJson.slice(0, 32000);
  if (proj.finalVideoPath)
    payload.finalVideoPath = proj.finalVideoPath.slice(0, 400);
  if (proj.captionsPath) payload.captionsPath = proj.captionsPath.slice(0, 400);
  if (proj.qualityReportJson)
    payload.qualityReportJson = proj.qualityReportJson.slice(0, 4000);

  try {
    if (existingId) {
      const snap = await getDoc(doc(db, docPath));
      if (snap.exists()) {
        const { userId: _u, ...upd } = payload;
        await updateDoc(doc(db, docPath), upd);
        return id;
      }
    }
    await setDoc(doc(db, docPath), { ...payload, createdAt: serverTimestamp() });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCreatorProject(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/creatorProjects/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// Content Calendar
export function subscribeCreatorCalendar(
  uid: string,
  onData: (items: CreatorCalendarDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorCalendar`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('scheduledDate', 'asc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CreatorCalendarDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function addCreatorCalendarEntry(
  uid: string,
  entry: Omit<CreatorCalendarDoc, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeCreatorId('cal');
  const docPath = `users/${uid}/creatorCalendar/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    title: entry.title.trim().slice(0, 300),
    platform: entry.platform.trim().slice(0, 32),
    format: entry.format,
    scheduledDate: entry.scheduledDate.trim().slice(0, 32),
    status: entry.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (entry.notes) payload.notes = entry.notes.trim().slice(0, 1200);
  try {
    await setDoc(doc(db, docPath), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateCreatorCalendarEntry(
  uid: string,
  id: string,
  patch: Partial<Pick<CreatorCalendarDoc, 'status' | 'scheduledDate' | 'notes' | 'title' | 'platform' | 'format'>>
): Promise<void> {
  const docPath = `users/${uid}/creatorCalendar/${id}`;
  try {
    await updateDoc(doc(db, docPath), { ...patch, updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteCreatorCalendarEntry(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/creatorCalendar/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// Published Posts Log
export function subscribeCreatorPosts(
  uid: string,
  onData: (items: CreatorPostDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorPosts`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CreatorPostDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function addCreatorPost(
  uid: string,
  post: Omit<CreatorPostDoc, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const id = makeCreatorId('post');
  const docPath = `users/${uid}/creatorPosts/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    platform: post.platform.slice(0, 32),
    title: post.title.trim().slice(0, 300),
    status: post.status,
    createdAt: serverTimestamp(),
  };
  if (post.caption) payload.caption = post.caption.slice(0, 5000);
  if (post.externalPostId)
    payload.externalPostId = post.externalPostId.slice(0, 240);
  if (post.externalUrl) payload.externalUrl = post.externalUrl.slice(0, 600);
  if (post.errorMessage) payload.errorMessage = post.errorMessage.slice(0, 1000);

  try {
    await setDoc(doc(db, docPath), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

// Reports Archive
export function subscribeCreatorReports(
  uid: string,
  onData: (items: CreatorReportDoc[]) => void,
  onError?: (err: Error) => void
) {
  const colPath = `users/${uid}/creatorReports`;
  const q = query(
    collection(db, colPath),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CreatorReportDoc, 'id'>),
        }))
      );
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, colPath);
    }
  );
}

export async function saveCreatorReport(
  uid: string,
  report: Omit<CreatorReportDoc, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const id = makeCreatorId('rep');
  const docPath = `users/${uid}/creatorReports/${id}`;
  try {
    await setDoc(doc(db, docPath), {
      userId: uid,
      title: report.title.trim().slice(0, 300),
      reportType: report.reportType,
      summary: report.summary.trim().slice(0, 16000),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deleteCreatorReport(uid: string, id: string): Promise<void> {
  const docPath = `users/${uid}/creatorReports/${id}`;
  try {
    await deleteDoc(doc(db, docPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
