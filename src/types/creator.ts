export type CreatorSectionId =
  | 'overview'
  | 'accounts'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'ideas'
  | 'competitor'
  | 'scripts'
  | 'video'
  | 'thumbnails'
  | 'seo'
  | 'publish'
  | 'calendar'
  | 'reports';

export type SocialPlatformId =
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'telegram'
  | 'x'
  | 'linkedin';

export type AIProviderChoice = 'auto' | 'claude' | 'gemini';

export interface CreatorVoiceCommand {
  id: number;
  action: string;
  topic?: string;
  section?: CreatorSectionId;
  platform?: string;
}

export interface CreatorConnectionDoc {
  id: string;
  userId: string;
  platform: SocialPlatformId;
  connected: boolean;
  accountName: string;
  handle?: string;
  channelId?: string;
  avatarUrl?: string;
  followersCount?: number;
  notes?: string;
  updatedAt?: unknown;
}

export interface CreatorProviderStatus {
  ai: {
    gemini: { configured: boolean; source: string };
    claude: { configured: boolean; source: string; model: string };
  };
  mediaProviders: {
    elevenlabs: { configured: boolean; source: string };
    runway: { configured: boolean; source: string };
    pexels: { configured: boolean; source: string };
    youtubeApiKey: { configured: boolean; source: string };
    telegram: { configured: boolean; chatId: string; source: string };
  };
  oauth: Record<
    Exclude<SocialPlatformId, 'telegram'>,
    {
      connected: boolean;
      accountId?: string;
      accountName?: string;
      handle?: string;
      avatarUrl?: string;
      followersCount?: number | null;
    }
  >;
}

export interface OAuthPlatformSetup {
  platform: Exclude<SocialPlatformId, 'telegram'>;
  configured: boolean;
  missingEnv: string[];
  callbackUrl: string;
}

export interface YouTubeAnalyticsPayload {
  connected: boolean;
  dateRange: { range: string; startDate: string; endDate: string };
  channel: {
    id: string;
    title: string;
    handle: string;
    totalLifetimeViews: number | null;
    subscribers: number | null;
    videoCount: number | null;
  };
  metrics: {
    views: number | null;
    subscribers: number | null;
    subscriberGrowth: number | null;
    watchTimeMinutes: number | null;
    averageViewDurationSec: number | null;
    audienceRetentionPct: number | null;
    ctrPercent: number | null;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
  };
  analyticsNote?: string;
  dailySeries: Array<{
    date: string;
    views: number;
    watchTimeMinutes: number;
    subscribersNet: number;
    likes: number;
    comments: number;
  }>;
  trafficSources: Array<{
    source: string;
    views: number;
    watchTimeMinutes: number;
  }>;
  topVideos: YouTubeVideoStat[];
  underperformingVideos: YouTubeVideoStat[];
  formatComparison: {
    shorts: {
      count: number;
      totalViews: number;
      avgViews: number | null;
      totalLikes: number;
    };
    longForm: {
      count: number;
      totalViews: number;
      avgViews: number | null;
      totalLikes: number;
    };
  };
}

export interface YouTubeVideoStat {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  durationSec: number;
  format: 'short' | 'long';
  views: number;
  likes: number;
  comments: number;
}

export interface InstagramAnalyticsPayload {
  connected: boolean;
  profile: {
    id?: string;
    name: string;
    username: string;
    followers: number | null;
    following: number | null;
    mediaCount: number | null;
  };
  metrics: {
    reach: number | null;
    views: number | null;
    profileViews: number | null;
  };
  media: Array<{
    id: string;
    caption?: string;
    media_type?: string;
    media_product_type?: string;
    permalink?: string;
    timestamp?: string;
    like_count?: number;
    comments_count?: number;
  }>;
}

export interface FacebookAnalyticsPayload {
  connected: boolean;
  page: {
    id?: string;
    name?: string;
    category: string;
    fans: number | null;
    followers: number | null;
  };
  metrics: {
    impressions28d: number | null;
    engagements28d: number | null;
    pageViews28d: number | null;
  };
  videos: Array<{
    id: string;
    title?: string;
    description?: string;
    created_time?: string;
    length?: number;
    permalink_url?: string;
    views?: number;
  }>;
}

export interface CreatorSnapshotDoc {
  id: string;
  userId: string;
  platform: 'youtube' | 'instagram' | 'facebook';
  dateRange: string;
  summaryJson: string;
  views?: number;
  subscribers?: number;
  watchTimeMinutes?: number;
  createdAt?: unknown;
}

export interface CreatorIdeaDoc {
  id: string;
  userId: string;
  topic: string;
  targetAudience?: string;
  suggestedFormat: string;
  suggestedLength?: string;
  hook?: string;
  contentAngle?: string;
  researchSources?: string[];
  reason?: string;
  confidence: 'low' | 'medium' | 'high';
  status: 'saved' | 'scripted' | 'produced' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScriptSceneItem {
  index: number;
  title: string;
  durationSec: number;
  narration: string;
  visualPrompt: string;
  overlayText?: string;
  assetFilename?: string;
  assetPreviewUrl?: string;
  assetSource?: 'runway' | 'pexels' | 'upload' | 'storyboard';
}

export interface PlatformSeoMetadata {
  youtubeTitles?: string[];
  youtubeDescription?: string;
  youtubeKeywords?: string[];
  youtubeHashtags?: string[];
  instagramCaption?: string;
  instagramHashtags?: string[];
  facebookCaption?: string;
  xPost?: string;
  linkedinPost?: string;
}

export interface CreatorScriptDoc {
  id: string;
  userId: string;
  title: string;
  format: 'short' | 'long';
  platform?: string;
  durationTarget?: string;
  hook?: string;
  body: string;
  scenesJson?: string;
  seoJson?: string;
  aiProvider?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VideoQualityReport {
  passed: boolean;
  width: number;
  height: number;
  expectedResolution: string;
  aspectRatio: '9:16' | '16:9';
  durationSec: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  bitrateKbps: number;
  fileSizeBytes: number;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
}

export interface CreatorProjectDoc {
  id: string;
  userId: string;
  title: string;
  aspectRatio: '9:16' | '16:9';
  status:
    | 'draft'
    | 'assets_ready'
    | 'voiced'
    | 'rendered'
    | 'verified'
    | 'published';
  currentStep: number;
  videoProvider?: string;
  voiceEngine?: string;
  pipelineJson?: string;
  finalVideoPath?: string;
  captionsPath?: string;
  qualityReportJson?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CreatorCalendarDoc {
  id: string;
  userId: string;
  title: string;
  platform: string;
  format: 'short' | 'long' | 'post';
  scheduledDate: string;
  status: 'planned' | 'in_production' | 'scheduled' | 'published';
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CreatorPostDoc {
  id: string;
  userId: string;
  platform: string;
  title: string;
  caption?: string;
  status: 'scheduled' | 'published' | 'failed';
  externalPostId?: string;
  externalUrl?: string;
  errorMessage?: string;
  createdAt?: unknown;
}

export interface CreatorReportDoc {
  id: string;
  userId: string;
  title: string;
  reportType: 'performance' | 'competitor';
  summary: string;
  createdAt?: unknown;
}
