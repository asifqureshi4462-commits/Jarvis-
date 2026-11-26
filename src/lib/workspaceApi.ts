export interface GmailSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  htmlLink?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
  listId: string;
}

export interface ContactPerson {
  resourceName: string;
  name: string;
  email?: string;
  phone?: string;
}

async function googleFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Google API Error (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// GMAIL
export async function fetchGmailMessages(
  accessToken: string,
  query = '',
  maxResults = 10
): Promise<{ messages: GmailSummary[]; unreadCount: number }> {
  const qParam = query ? `&q=${encodeURIComponent(query)}` : '';
  const list = await googleFetch<{
    messages?: Array<{ id: string; threadId: string }>;
  }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${qParam}`,
    accessToken
  );

  const unreadList = await googleFetch<{ resultSizeEstimate?: number }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=1`,
    accessToken
  );

  const items = list.messages || [];
  const details = await Promise.all(
    items.slice(0, maxResults).map(async (m) => {
      const msg = await googleFetch<{
        id: string;
        threadId: string;
        snippet?: string;
        labelIds?: string[];
        payload?: {
          headers?: Array<{ name: string; value: string }>;
        };
      }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        accessToken
      );
      const headers = msg.payload?.headers || [];
      const getH = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
        '';
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: getH('Subject') || '(No Subject)',
        from: getH('From') || 'Unknown Sender',
        date: getH('Date') || '',
        snippet: msg.snippet || '',
        unread: Boolean(msg.labelIds?.includes('UNREAD')),
      };
    })
  );

  return {
    messages: details,
    unreadCount: unreadList.resultSizeEstimate ?? details.filter((d) => d.unread).length,
  };
}

function encodeEmailBase64(to: string, subject: string, body: string): string {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createGmailDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string
) {
  const raw = encodeEmailBase64(to, subject, body);
  return googleFetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ message: { raw } }),
    }
  );
}

export async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
) {
  const raw = encodeEmailBase64(to, subject, body);
  return googleFetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ raw }),
    }
  );
}

// GOOGLE CALENDAR
export async function fetchCalendarEvents(
  accessToken: string,
  maxResults = 12
): Promise<CalendarEventItem[]> {
  const timeMin = new Date().toISOString();
  const data = await googleFetch<{
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      htmlLink?: string;
    }>;
  }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`,
    accessToken
  );

  return (data.items || []).map((ev) => ({
    id: ev.id,
    summary: ev.summary || '(Untitled Event)',
    start: ev.start?.dateTime || ev.start?.date || '',
    end: ev.end?.dateTime || ev.end?.date || '',
    location: ev.location,
    htmlLink: ev.htmlLink,
  }));
}

export async function createCalendarEvent(
  accessToken: string,
  summary: string,
  startIso: string,
  endIso: string,
  description?: string
) {
  return googleFetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: new Date(startIso).toISOString() },
        end: { dateTime: new Date(endIso).toISOString() },
      }),
    }
  );
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
) {
  return googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
      eventId
    )}`,
    accessToken,
    { method: 'DELETE' }
  );
}

// GOOGLE DRIVE + DOCS / SHEETS / SLIDES / FORMS
export async function fetchDriveFiles(
  accessToken: string,
  searchQuery = ''
): Promise<DriveFileItem[]> {
  const q = searchQuery
    ? `name contains '${searchQuery.replace(/'/g, "\\'")}' and trashed = false`
    : 'trashed = false';
  const data = await googleFetch<{ files?: DriveFileItem[] }>(
    `https://www.googleapis.com/drive/v3/files?pageSize=15&q=${encodeURIComponent(
      q
    )}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc`,
    accessToken
  );
  return data.files || [];
}

export async function readWorkspaceFilePreview(
  accessToken: string,
  file: DriveFileItem
): Promise<string> {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const docData = await googleFetch<{
      title?: string;
      body?: {
        content?: Array<{
          paragraph?: {
            elements?: Array<{ textRun?: { content?: string } }>;
          };
        }>;
      };
    }>(`https://docs.googleapis.com/v1/documents/${file.id}`, accessToken);
    const text = (docData.body?.content || [])
      .flatMap((c) => c.paragraph?.elements || [])
      .map((e) => e.textRun?.content || '')
      .join('');
    return text.slice(0, 3000) || '(Empty Google Doc)';
  }

  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const sheetData = await googleFetch<{
      properties?: { title?: string };
      sheets?: Array<{ properties?: { title?: string } }>;
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${file.id}?fields=properties.title,sheets.properties.title`,
      accessToken
    );
    const firstSheet = sheetData.sheets?.[0]?.properties?.title || 'Sheet1';
    const valuesRes = await googleFetch<{ values?: string[][] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/${encodeURIComponent(
        firstSheet
      )}!A1:F15`,
      accessToken
    );
    return (valuesRes.values || [])
      .map((row) => row.join(' | '))
      .join('\n') || '(Empty Spreadsheet)';
  }

  if (file.mimeType === 'application/vnd.google-apps.presentation') {
    const slideData = await googleFetch<{
      title?: string;
      slides?: Array<{ objectId: string }>;
    }>(
      `https://slides.googleapis.com/v1/presentations/${file.id}`,
      accessToken
    );
    return `Google Slides: "${slideData.title || file.name}" (${
      slideData.slides?.length || 0
    } slides)`;
  }

  if (file.mimeType === 'application/vnd.google-apps.form') {
    const formData = await googleFetch<{
      info?: { title?: string; description?: string };
      items?: Array<{ title?: string }>;
    }>(`https://forms.googleapis.com/v1/forms/${file.id}`, accessToken);
    const questions = (formData.items || [])
      .map((i, idx) => `${idx + 1}. ${i.title || 'Question'}`)
      .join('\n');
    return `Form: ${formData.info?.title || file.name}\n${questions}`;
  }

  return `File: ${file.name} (${file.mimeType})`;
}

// GOOGLE TASKS
export async function fetchGoogleTasks(
  accessToken: string
): Promise<GoogleTaskItem[]> {
  const lists = await googleFetch<{
    items?: Array<{ id: string; title: string }>;
  }>('https://tasks.googleapis.com/tasks/v1/users/@me/lists', accessToken);
  const primaryList = lists.items?.[0];
  if (!primaryList) return [];
  const tasks = await googleFetch<{
    items?: Array<{
      id: string;
      title: string;
      status: 'needsAction' | 'completed';
      due?: string;
    }>;
  }>(
    `https://tasks.googleapis.com/tasks/v1/lists/${primaryList.id}/tasks?maxResults=20`,
    accessToken
  );
  return (tasks.items || []).map((t) => ({
    ...t,
    listId: primaryList.id,
  }));
}

export async function createGoogleTask(
  accessToken: string,
  title: string
): Promise<void> {
  const lists = await googleFetch<{
    items?: Array<{ id: string }>;
  }>('https://tasks.googleapis.com/tasks/v1/users/@me/lists', accessToken);
  const listId = lists.items?.[0]?.id || '@default';
  await googleFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    }
  );
}

// GOOGLE MEET
export async function createGoogleMeetSpace(
  accessToken: string
): Promise<{ meetingUri: string; meetingCode: string }> {
  const data = await googleFetch<{
    meetingUri?: string;
    meetingCode?: string;
  }>('https://meet.googleapis.com/v2/spaces', accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    meetingUri: data.meetingUri || '',
    meetingCode: data.meetingCode || '',
  };
}

// GOOGLE CHAT
export async function fetchGoogleChatSpaces(accessToken: string) {
  return googleFetch<{
    spaces?: Array<{ name: string; displayName?: string; spaceType?: string }>;
  }>('https://chat.googleapis.com/v1/spaces', accessToken);
}

// GOOGLE CONTACTS (PEOPLE API)
export async function fetchContacts(
  accessToken: string
): Promise<ContactPerson[]> {
  const data = await googleFetch<{
    connections?: Array<{
      resourceName: string;
      names?: Array<{ displayName?: string }>;
      emailAddresses?: Array<{ value?: string }>;
      phoneNumbers?: Array<{ value?: string }>;
    }>;
  }>(
    'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=25',
    accessToken
  );

  return (data.connections || []).map((c) => ({
    resourceName: c.resourceName,
    name: c.names?.[0]?.displayName || 'Unnamed Contact',
    email: c.emailAddresses?.[0]?.value,
    phone: c.phoneNumbers?.[0]?.value,
  }));
}
