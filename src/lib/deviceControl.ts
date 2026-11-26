import type { NavSection } from '../types/jarvis';

export type DeviceTarget =
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'browser'
  | 'chrome'
  | 'maps'
  | 'gmail'
  | 'calendar'
  | 'camera'
  | 'gallery'
  | 'calculator'
  | 'settings'
  | 'bluetooth'
  | 'wifi'
  | 'phone'
  | 'alarm'
  | 'creator'
  | 'memory'
  | 'chat'
  | 'soul'
  | 'workspace';

export interface DeviceExecutionOutcome {
  ok: boolean;
  target: DeviceTarget | string;
  method: 'web_url' | 'android_intent' | 'in_app_modal' | 'in_app_nav' | 'tel_confirm' | 'timer_created' | 'sandbox_limited' | 'blocked';
  message: string;
  requiresConfirmation?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  onConfirm?: () => void;
}

export interface DeviceControlCallbacks {
  navigate: (section: NavSection) => void;
  openCamera: () => void;
  openGalleryPicker: () => void;
  openCalculator: () => void;
  addAlarm: (label: string, endsAtMs: number) => void;
}

function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

function safeOpenExternal(url: string, label: string): DeviceExecutionOutcome {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        ok: false,
        target: label,
        method: 'blocked',
        message: `Blocked unsafe URL protocol for ${label}. Only https:// and http:// links are permitted.`,
      };
    }
    const win = window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
    if (!win) {
      return {
        ok: false,
        target: label,
        method: 'blocked',
        message: `Your browser blocked opening ${label} in a new tab. Please allow pop-ups for this site or tap the action link manually.`,
      };
    }
    return {
      ok: true,
      target: label,
      method: 'web_url',
      message: `Opened ${label} cleanly, Sir.`,
    };
  } catch {
    return {
      ok: false,
      target: label,
      method: 'blocked',
      message: `Invalid URL provided for ${label}.`,
    };
  }
}

function triggerAndroidIntentOrWeb(intentUrl: string, fallbackWebUrl: string, label: string): DeviceExecutionOutcome {
  if (isAndroidDevice()) {
    try {
      window.location.href = intentUrl;
      return {
        ok: true,
        target: label,
        method: 'android_intent',
        message: `Sent Android app launch request for ${label}. If the app is not installed, Android will fall back to web.`,
      };
    } catch {
      return safeOpenExternal(fallbackWebUrl, label);
    }
  }
  return safeOpenExternal(fallbackWebUrl, label);
}

/**
 * Parses either relative duration ("5 minutes", "30 seconds") or clock time ("6 AM", "6:30 PM", "18:45")
 */
export function parseAlarmSchedule(rawQuery: string): { endsAt: number; label: string; readable: string } | null {
  const clean = rawQuery.trim();
  const now = new Date();

  const secMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:sec|secs|second|seconds|secondon)/i);
  if (secMatch) {
    const secs = Math.max(5, Math.min(3600, Number(secMatch[1])));
    const endsAt = Date.now() + secs * 1000;
    return { endsAt, label: `${secs}s Timer`, readable: `${secs} seconds` };
  }

  const minMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|minto|minuteon)/i);
  if (minMatch) {
    const mins = Math.max(0.1, Math.min(240, Number(minMatch[1])));
    const endsAt = Date.now() + mins * 60 * 1000;
    return { endsAt, label: `${mins}m Timer`, readable: `${mins} minutes` };
  }

  const hrMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|ghanta|ghante)/i);
  if (hrMatch) {
    const hrs = Math.max(0.1, Math.min(12, Number(hrMatch[1])));
    const endsAt = Date.now() + hrs * 3600 * 1000;
    return { endsAt, label: `${hrs}h Timer`, readable: `${hrs} hours` };
  }

  const clockMatch = clean.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)?\b/i);
  if (clockMatch) {
    let hour = parseInt(clockMatch[1], 10);
    const minute = clockMatch[2] ? parseInt(clockMatch[2], 10) : 0;
    const meridiem = clockMatch[3]?.toLowerCase();

    if (hour >= 0 && hour <= 24 && minute >= 0 && minute <= 59) {
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;

      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      const readable = target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        endsAt: target.getTime(),
        label: `Alarm (${readable})`,
        readable,
      };
    }
  }

  return null;
}

export async function requestNotificationPermissionIfPossible(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

export function executeDeviceControl(
  targetRaw: string,
  queryRaw: string | undefined,
  callbacks: DeviceControlCallbacks
): DeviceExecutionOutcome {
  const target = targetRaw.trim().toLowerCase() as DeviceTarget;
  const query = (queryRaw || '').trim();

  switch (target) {
    case 'youtube': {
      const webUrl = query
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : 'https://www.youtube.com';
      const intentUrl = query
        ? `intent://www.youtube.com/results?search_query=${encodeURIComponent(query)}#Intent;package=com.google.android.youtube;scheme=https;end`
        : 'intent://www.youtube.com/#Intent;package=com.google.android.youtube;scheme=https;end';
      return triggerAndroidIntentOrWeb(
        intentUrl,
        webUrl,
        query ? `YouTube search "${query}"` : 'YouTube'
      );
    }

    case 'instagram':
      return triggerAndroidIntentOrWeb(
        'intent://www.instagram.com/#Intent;package=com.instagram.android;scheme=https;end',
        'https://www.instagram.com',
        'Instagram'
      );

    case 'facebook':
      return triggerAndroidIntentOrWeb(
        'intent://www.facebook.com/#Intent;package=com.facebook.katana;scheme=https;end',
        'https://www.facebook.com',
        'Facebook'
      );

    case 'whatsapp': {
      const waUrl = query
        ? `https://wa.me/?text=${encodeURIComponent(query)}`
        : 'https://web.whatsapp.com';
      return triggerAndroidIntentOrWeb(
        `intent://send?text=${encodeURIComponent(query)}#Intent;package=com.whatsapp;scheme=whatsapp;end`,
        waUrl,
        'WhatsApp'
      );
    }

    case 'chrome':
    case 'browser': {
      if (!query) {
        return safeOpenExternal('https://www.google.com', 'Web Browser');
      }
      if (/^https?:\/\//i.test(query)) {
        return safeOpenExternal(query, query);
      }
      if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(query)) {
        return safeOpenExternal(`https://${query}`, query);
      }
      return safeOpenExternal(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        `Google Search for "${query}"`
      );
    }

    case 'maps':
      callbacks.navigate('maps');
      if (query) {
        return {
          ok: true,
          target: 'maps',
          method: 'in_app_nav',
          message: `Opened Navigation & Spatial Intelligence view, Sir. Use the search bar or ask me for "${query}".`,
        };
      }
      return {
        ok: true,
        target: 'maps',
        method: 'in_app_nav',
        message: 'Navigated to Google Maps view, Sir.',
      };

    case 'gmail':
      callbacks.navigate('workspace');
      return {
        ok: true,
        target: 'gmail',
        method: 'in_app_nav',
        message: 'Opened Workspace Hub for Gmail, Sir.',
      };

    case 'calendar':
      callbacks.navigate('workspace');
      return {
        ok: true,
        target: 'calendar',
        method: 'in_app_nav',
        message: 'Opened Workspace Hub for Google Calendar, Sir.',
      };

    case 'settings':
      callbacks.navigate('settings');
      return {
        ok: true,
        target: 'settings',
        method: 'in_app_nav',
        message: 'Opened J.A.R.V.I.S System Settings, Sir.',
      };

    case 'creator':
      callbacks.navigate('creator');
      return {
        ok: true,
        target: 'creator',
        method: 'in_app_nav',
        message: 'Opened Creator Studio, Sir.',
      };

    case 'memory':
      callbacks.navigate('memory');
      return {
        ok: true,
        target: 'memory',
        method: 'in_app_nav',
        message: 'Opened Memory Core, Sir.',
      };

    case 'chat':
      callbacks.navigate('chat');
      return {
        ok: true,
        target: 'chat',
        method: 'in_app_nav',
        message: 'Opened Conversational Chat screen, Sir.',
      };

    case 'soul':
      callbacks.navigate('soul');
      return {
        ok: true,
        target: 'soul',
        method: 'in_app_nav',
        message: 'Opened SOUL Personality Core, Sir.',
      };

    case 'workspace':
      callbacks.navigate('workspace');
      return {
        ok: true,
        target: 'workspace',
        method: 'in_app_nav',
        message: 'Opened Google Workspace Hub, Sir.',
      };

    case 'camera':
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return {
          ok: false,
          target: 'camera',
          method: 'sandbox_limited',
          message:
            'Browser camera capture API (navigator.mediaDevices.getUserMedia) is unavailable in this environment.',
        };
      }
      callbacks.openCamera();
      return {
        ok: true,
        target: 'camera',
        method: 'in_app_modal',
        message: 'Opening live Camera viewfinder, Sir. You can capture a photo for instant analysis.',
      };

    case 'gallery':
      callbacks.openGalleryPicker();
      return {
        ok: true,
        target: 'gallery',
        method: 'in_app_modal',
        message: 'Opening your device photo & video picker, Sir.',
      };

    case 'calculator':
      callbacks.openCalculator();
      return {
        ok: true,
        target: 'calculator',
        method: 'in_app_modal',
        message: 'Opened J.A.R.V.I.S Calculator, Sir.',
      };

    case 'bluetooth':
    case 'wifi': {
      const label = target === 'bluetooth' ? 'Bluetooth' : 'Wi-Fi';
      if (isAndroidDevice()) {
        const actionIntent =
          target === 'bluetooth'
            ? 'intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end'
            : 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end';
        try {
          window.location.href = actionIntent;
          return {
            ok: true,
            target: label,
            method: 'android_intent',
            message: `Requested Android ${label} settings panel. Note: Browsers and PWAs cannot silently toggle ${label} hardware state without native Android system permissions.`,
          };
        } catch {
          // Fall through to honest limitation message
        }
      }
      return {
        ok: false,
        target: label,
        method: 'sandbox_limited',
        message: `Browser security sandbox restricts web applications and PWAs from toggling system ${label} directly. Please adjust ${label} in your device quick settings.`,
      };
    }

    case 'phone': {
      const cleaned = query.replace(/[^\d+*#()-]/g, '').trim();
      if (!cleaned) {
        return {
          ok: false,
          target: 'phone',
          method: 'blocked',
          message: 'Please specify a valid phone number to dial, Sir.',
        };
      }
      return {
        ok: true,
        target: 'phone',
        method: 'tel_confirm',
        requiresConfirmation: true,
        confirmTitle: 'Confirm Phone Call Intent',
        confirmDescription: `Launch your device dialer to call ${cleaned}?`,
        message: `Ready to dial ${cleaned}, Sir. Please confirm in the dialog.`,
        onConfirm: () => {
          window.location.href = `tel:${cleaned}`;
        },
      };
    }

    case 'alarm': {
      const parsed = parseAlarmSchedule(query || '5 minutes');
      if (!parsed) {
        return {
          ok: false,
          target: 'alarm',
          method: 'blocked',
          message: 'Could not parse alarm time or duration. Try "set a timer for 5 minutes" or "set an alarm for 6 AM".',
        };
      }
      requestNotificationPermissionIfPossible();
      callbacks.addAlarm(parsed.label, parsed.endsAt);
      return {
        ok: true,
        target: 'alarm',
        method: 'timer_created',
        message: `Alarm scheduled for ${parsed.readable}, Sir. Keep this tab active for the audio chime and browser notification.`,
      };
    }

    default:
      return {
        ok: false,
        target,
        method: 'sandbox_limited',
        message: `Target "${target}" is not natively wired as a direct browser action.`,
      };
  }
}
