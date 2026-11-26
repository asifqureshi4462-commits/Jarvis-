import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Layers,
  Mic,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react';
import { creatorFetchJson, uploadProjectBinaryAsset } from '../../lib/creatorApi';
import {
  addCreatorPost,
  deleteCreatorProject,
  saveCreatorProject,
} from '../../lib/creatorFirebase';
import type {
  AIProviderChoice,
  CreatorPostDoc,
  CreatorProjectDoc,
  CreatorProviderStatus,
  PlatformSeoMetadata,
  ScriptSceneItem,
  SocialPlatformId,
  VideoQualityReport,
} from '../../types/creator';
import type { ConfirmDialogState } from '../../types/jarvis';

const PIPELINE_STEPS = [
  '1 Topic',
  '2 Script',
  '3 Scenes',
  '4 Prompts',
  '5 Provider',
  '6 Assets',
  '7 Voice',
  '8 Captions',
  '9 Compose',
  '10 Render',
  '11 Quality',
  '12 Store',
];

async function renderStoryboardFrameBlob(params: {
  aspectRatio: '9:16' | '16:9';
  sceneNumber: number;
  title: string;
  overlayText: string;
  visualPrompt: string;
}): Promise<Blob> {
  const width = params.aspectRatio === '9:16' ? 1080 : 1920;
  const height = params.aspectRatio === '9:16' ? 1920 : 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const palettes = [
    ['#04070D', '#0A2540', '#22D3EE'],
    ['#050812', '#132A2E', '#34D399'],
    ['#070913', '#1E1B4B', '#38BDF8'],
    ['#060A14', '#2A1810', '#F59E0B'],
  ];
  const [bg1, bg2, accent] = palettes[(params.sceneNumber - 1) % palettes.length];

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, bg1);
  grad.addColorStop(1, bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle futuristic HUD grid
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
  ctx.lineWidth = 2;
  const step = 90;
  for (let x = 0; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Geometric focal ring
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(width / 2, height * 0.42, Math.min(width, height) * 0.24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Header Badge
  ctx.fillStyle = accent;
  ctx.font = 'bold 34px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`J.A.R.V.I.S STUDIO · SCENE 0${params.sceneNumber}`, width / 2, height * 0.14);

  // Main Title / Overlay
  const headline = (params.overlayText || params.title || 'AI INTELLIGENCE').toUpperCase();
  ctx.fillStyle = '#F8FAFC';
  ctx.font = `bold ${params.aspectRatio === '9:16' ? 76 : 86}px "Chakra Petch", sans-serif`;
  const words = headline.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > width * 0.82) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const lineH = params.aspectRatio === '9:16' ? 92 : 104;
  const startY = height * 0.46 - ((lines.length - 1) * lineH) / 2;
  lines.slice(0, 4).forEach((line, idx) => {
    ctx.fillText(line, width / 2, startY + idx * lineH);
  });

  // Visual cue footer
  ctx.fillStyle = '#94A3B8';
  ctx.font = '30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(params.visualPrompt.slice(0, 68), width / 2, height * 0.82);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Storyboard frame render failed.'))),
      'image/png'
    );
  });
}

interface VideoCreatorViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  providerStatus: CreatorProviderStatus | null;
  projects: CreatorProjectDoc[];
  incomingDraft?: {
    title: string;
    format: 'short' | 'long';
    fullScript: string;
    scenes: ScriptSceneItem[];
  } | null;
  onClearIncomingDraft: () => void;
  onSendToPublish: (payload: {
    projectId: string;
    title: string;
    aspectRatio: '9:16' | '16:9';
    videoFilename: string;
    videoUrl: string;
    scriptSummary: string;
  }) => void;
  onSendVideoToThumbnail: (videoUrl: string, title: string, aspectRatio: '9:16' | '16:9') => void;
  onNotice: (msg: string) => void;
}

export const VideoCreatorView: React.FC<VideoCreatorViewProps> = ({
  uid,
  aiProvider,
  providerStatus,
  projects,
  incomingDraft,
  onClearIncomingDraft,
  onSendToPublish,
  onSendVideoToThumbnail,
  onNotice,
}) => {
  const [projectId, setProjectId] = useState<string>(() => `proj_${Date.now()}`);
  const [title, setTitle] = useState('AI Agents Workflow Breakdown');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [videoProvider, setVideoProvider] = useState<
    'pexels' | 'runway' | 'upload' | 'storyboard'
  >('storyboard');
  const [voiceEngine, setVoiceEngine] = useState<'gemini' | 'elevenlabs'>('gemini');
  const [geminiVoiceName, setGeminiVoiceName] = useState('Charon');
  const [currentStep, setCurrentStep] = useState(1);

  const [fullScript, setFullScript] = useState('');
  const [scenes, setScenes] = useState<ScriptSceneItem[]>([]);
  const [pexelsResults, setPexelsResults] = useState<
    Record<
      number,
      Array<{
        id: number;
        duration: number;
        previewImage: string;
        downloadUrl: string;
        width: number;
        height: number;
      }>
    >
  >({});

  const [voiceoverFilename, setVoiceoverFilename] = useState('');
  const [voiceoverUrl, setVoiceoverUrl] = useState('');
  const [musicFilename, setMusicFilename] = useState('');
  const [captionsSrt, setCaptionsSrt] = useState('');
  const [captionsVtt, setCaptionsVtt] = useState('');
  const [burnCaptions, setBurnCaptions] = useState(true);

  const [finalFilename, setFinalFilename] = useState('');
  const [renderedVideoUrl, setRenderedVideoUrl] = useState('');
  const [qualityReport, setQualityReport] = useState<VideoQualityReport | null>(null);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (incomingDraft) {
      setProjectId(`proj_${Date.now()}`);
      setTitle(incomingDraft.title);
      setAspectRatio(incomingDraft.format === 'short' ? '9:16' : '16:9');
      setFullScript(incomingDraft.fullScript);
      setScenes(
        incomingDraft.scenes.length > 0
          ? incomingDraft.scenes
          : [
              {
                index: 1,
                title: 'Hook & Core Concept',
                durationSec: incomingDraft.format === 'short' ? 10 : 20,
                narration: incomingDraft.fullScript.slice(0, 300),
                visualPrompt: `Futuristic AI interface visualizing ${incomingDraft.title}`,
                overlayText: incomingDraft.title.slice(0, 42),
              },
            ]
      );
      setCurrentStep(3);
      setFinalFilename('');
      setRenderedVideoUrl('');
      setQualityReport(null);
      onClearIncomingDraft();
    }
  }, [incomingDraft, onClearIncomingDraft]);

  // Step 1–4: AI Research + Script + Scenes + Visual Prompts
  const handleGenerateBlueprint = async () => {
    if (!uid || !title.trim()) {
      onNotice('Enter a video topic or title first.');
      return;
    }
    setBusyMsg('Architecting script, scenes & visual prompts...');
    setCurrentStep(2);
    try {
      const format = aspectRatio === '9:16' ? 'short' : 'long';
      const res = await creatorFetchJson<{
        result: {
          title: string;
          hook: string;
          fullScript: string;
          scenes: ScriptSceneItem[];
        };
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'script',
          provider: aiProvider,
          payload: {
            topic: title.trim(),
            format,
            platform: aspectRatio === '9:16' ? 'Reels / Shorts' : 'YouTube 16:9',
            duration: aspectRatio === '9:16' ? '35 seconds' : '6 minutes',
          },
        }),
      });
      setTitle(res.result.title || title);
      setFullScript(
        `${res.result.hook ? `${res.result.hook}\n\n` : ''}${res.result.fullScript || ''}`
      );
      setScenes(Array.isArray(res.result.scenes) ? res.result.scenes : []);
      setCurrentStep(4);
      onNotice('Script, scene breakdown, and visual prompts generated.');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Blueprint generation failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  // Step 5–6: Scene Asset Acquisition
  const handlePexelsSearch = async (sceneIndex: number, query: string) => {
    if (!uid) return;
    setBusyMsg(`Searching Pexels licensed clips for Scene ${sceneIndex + 1}...`);
    setCurrentStep(6);
    try {
      const res = await creatorFetchJson<{
        videos: Array<{
          id: number;
          duration: number;
          previewImage: string;
          downloadUrl: string;
          width: number;
          height: number;
        }>;
      }>('/api/creator/video/pexels-search', {
        method: 'POST',
        body: JSON.stringify({ query, aspectRatio }),
      });
      setPexelsResults((prev) => ({ ...prev, [sceneIndex]: res.videos || [] }));
      if (!res.videos?.length) onNotice('No Pexels videos matched that query.');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Pexels search failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleImportPexels = async (sceneIndex: number, downloadUrl: string) => {
    if (!uid) return;
    setBusyMsg(`Importing licensed Pexels clip for Scene ${sceneIndex + 1}...`);
    try {
      const res = await creatorFetchJson<{
        filename: string;
        sizeBytes: number;
        previewUrl: string;
      }>('/api/creator/video/pexels-import', {
        method: 'POST',
        body: JSON.stringify({ projectId, sceneIndex, downloadUrl }),
      });
      setScenes((prev) =>
        prev.map((sc, i) =>
          i === sceneIndex
            ? {
                ...sc,
                assetFilename: res.filename,
                assetPreviewUrl: res.previewUrl,
                assetSource: 'pexels',
              }
            : sc
        )
      );
      setCurrentStep(6);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Clip import failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleRunwayScene = async (sceneIndex: number, prompt: string) => {
    if (!uid) return;
    setBusyMsg(`Generating Runway Gen AI clip for Scene ${sceneIndex + 1}...`);
    setCurrentStep(6);
    try {
      const res = await creatorFetchJson<{
        filename: string;
        previewUrl: string;
      }>('/api/creator/video/runway-generate', {
        method: 'POST',
        body: JSON.stringify({ projectId, sceneIndex, prompt, aspectRatio }),
      });
      setScenes((prev) =>
        prev.map((sc, i) =>
          i === sceneIndex
            ? {
                ...sc,
                assetFilename: res.filename,
                assetPreviewUrl: res.previewUrl,
                assetSource: 'runway',
              }
            : sc
        )
      );
      onNotice(`Runway clip ready for Scene ${sceneIndex + 1}.`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Runway generation failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleUploadSceneAsset = async (sceneIndex: number, file: File) => {
    if (!uid) return;
    setBusyMsg(`Uploading ${file.name} for Scene ${sceneIndex + 1}...`);
    setCurrentStep(6);
    try {
      const safeExt = file.name.split('.').pop() || 'mp4';
      const res = await uploadProjectBinaryAsset(
        projectId,
        `scene_${sceneIndex}_${Date.now()}.${safeExt}`,
        file
      );
      setScenes((prev) =>
        prev.map((sc, i) =>
          i === sceneIndex
            ? {
                ...sc,
                assetFilename: res.filename,
                assetPreviewUrl: res.previewUrl,
                assetSource: 'upload',
              }
            : sc
        )
      );
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Asset upload failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleGenerateStoryboardAsset = async (sceneIndex: number) => {
    if (!uid || !scenes[sceneIndex]) return;
    setBusyMsg(`Rendering high-res storyboard frame for Scene ${sceneIndex + 1}...`);
    setCurrentStep(6);
    try {
      const sc = scenes[sceneIndex];
      const blob = await renderStoryboardFrameBlob({
        aspectRatio,
        sceneNumber: sceneIndex + 1,
        title: sc.title,
        overlayText: sc.overlayText || sc.title,
        visualPrompt: sc.visualPrompt,
      });
      const res = await uploadProjectBinaryAsset(
        projectId,
        `storyboard_${sceneIndex}_${Date.now()}.png`,
        blob
      );
      setScenes((prev) =>
        prev.map((item, i) =>
          i === sceneIndex
            ? {
                ...item,
                assetFilename: res.filename,
                assetPreviewUrl: res.previewUrl,
                assetSource: 'storyboard',
              }
            : item
        )
      );
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Storyboard render failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleGenerateAllStoryboards = async () => {
    for (let i = 0; i < scenes.length; i++) {
      if (!scenes[i].assetFilename) {
        await handleGenerateStoryboardAsset(i);
      }
    }
  };

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uid) return;
    setBusyMsg('Uploading background audio track...');
    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const res = await uploadProjectBinaryAsset(
        projectId,
        `music_${Date.now()}.${ext}`,
        file
      );
      setMusicFilename(res.filename);
      onNotice(`Background music ready: ${file.name}`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Music upload failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  // Step 7 & 8: Voiceover & Captions
  const handleGenerateVoiceover = async () => {
    if (!uid) return;
    const narrationText =
      fullScript.trim() || scenes.map((s) => s.narration).filter(Boolean).join(' ');
    if (!narrationText) {
      onNotice('Provide script narration before generating voiceover.');
      return;
    }
    setBusyMsg(`Synthesizing ${voiceEngine} voiceover & timed captions...`);
    setCurrentStep(7);
    try {
      const res = await creatorFetchJson<{
        audioFilename: string;
        durationSec: number;
        audioUrl: string;
        captionsSrt: string;
        captionsVtt: string;
      }>('/api/creator/video/voiceover', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          scriptText: narrationText,
          engine: voiceEngine,
          geminiVoiceName,
        }),
      });
      setVoiceoverFilename(res.audioFilename);
      setVoiceoverUrl(res.audioUrl);
      setCaptionsSrt(res.captionsSrt);
      setCaptionsVtt(res.captionsVtt);
      setCurrentStep(8);
      onNotice(`Voiceover (${res.durationSec.toFixed(1)}s) and SRT/VTT captions ready.`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Voiceover synthesis failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  // Step 9–12: FFmpeg Render + FFprobe Quality Check + Firestore Archive
  const handleRenderVideo = async () => {
    if (!uid) return;
    if (scenes.length === 0) {
      onNotice('Add or generate at least one scene before rendering.');
      return;
    }
    setBusyMsg('FFmpeg compositing scenes, audio & captions + ffprobe verification...');
    setCurrentStep(10);
    try {
      // Ensure any scene without a file gets a storyboard PNG automatically if storyboard selected
      let workingScenes = [...scenes];
      for (let i = 0; i < workingScenes.length; i++) {
        if (!workingScenes[i].assetFilename) {
          const blob = await renderStoryboardFrameBlob({
            aspectRatio,
            sceneNumber: i + 1,
            title: workingScenes[i].title,
            overlayText: workingScenes[i].overlayText || workingScenes[i].title,
            visualPrompt: workingScenes[i].visualPrompt,
          });
          const uploaded = await uploadProjectBinaryAsset(
            projectId,
            `storyboard_${i}_${Date.now()}.png`,
            blob
          );
          workingScenes[i] = {
            ...workingScenes[i],
            assetFilename: uploaded.filename,
            assetPreviewUrl: uploaded.previewUrl,
            assetSource: 'storyboard',
          };
        }
      }
      setScenes(workingScenes);

      const res = await creatorFetchJson<{
        finalFilename: string;
        videoUrl: string;
        quality: VideoQualityReport;
      }>('/api/creator/video/render', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          aspectRatio,
          scenes: workingScenes,
          voiceoverFilename: voiceoverFilename || undefined,
          musicFilename: musicFilename || undefined,
          burnCaptions: burnCaptions && Boolean(captionsSrt),
          captionsFilename: 'captions.srt',
        }),
      });

      setFinalFilename(res.finalFilename);
      setRenderedVideoUrl(res.videoUrl);
      setQualityReport(res.quality);
      setCurrentStep(res.quality.passed ? 12 : 11);

      await saveCreatorProject(
        uid,
        {
          title,
          aspectRatio,
          status: res.quality.passed ? 'verified' : 'rendered',
          currentStep: res.quality.passed ? 12 : 11,
          videoProvider,
          voiceEngine,
          pipelineJson: JSON.stringify({ fullScript, scenes: workingScenes }),
          finalVideoPath: res.finalFilename,
          captionsPath: captionsSrt ? 'captions.srt' : undefined,
          qualityReportJson: JSON.stringify(res.quality),
        },
        projectId
      );

      onNotice(
        res.quality.passed
          ? 'Video rendered via FFmpeg, verified by ffprobe, and saved.'
          : 'Video rendered, review ffprobe quality checklist.'
      );
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'FFmpeg video render failed.');
    } finally {
      setBusyMsg(null);
    }
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* 12-Step Pipeline Progress Strip */}
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 space-y-3 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
              12-STEP AI VIDEO PRODUCTION PIPELINE
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Real FFmpeg MP4 composition ({aspectRatio === '9:16' ? '1080×1920' : '1920×1080'})
              + ffprobe quality verification
            </p>
          </div>
          {busyMsg && (
            <span className="text-xs font-mono-hud text-amber-700 dark:text-amber-300">
              {busyMsg}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
          {PIPELINE_STEPS.map((label, idx) => {
            const stepNum = idx + 1;
            const done = currentStep > stepNum;
            const active = currentStep === stepNum;
            return (
              <div
                key={label}
                className={`rounded-lg border px-2 py-1.5 text-[10px] font-mono-hud text-center truncate ${
                  active
                    ? 'border-cyan-600 dark:border-cyan-400 bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 font-semibold'
                    : done
                      ? 'border-emerald-600/35 dark:border-emerald-500/35 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] text-slate-500'
                }`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1–5 Controls */}
      <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video Production Topic / Title"
            className="sm:col-span-2 min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100"
          />
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as '9:16' | '16:9')}
            className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="9:16">9:16 Vertical (Reels / Shorts)</option>
            <option value="16:9">16:9 Landscape (YouTube)</option>
          </select>
          <select
            value={videoProvider}
            onChange={(e) =>
              setVideoProvider(
                e.target.value as 'pexels' | 'runway' | 'upload' | 'storyboard'
              )
            }
            className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="storyboard">Canvas Motion + FFmpeg Zoompan</option>
            <option value="pexels">
              Pexels Licensed Video (
              {providerStatus?.mediaProviders.pexels.configured ? 'Ready' : 'Key Needed'})
            </option>
            <option value="runway">
              Runway Gen AI Video (
              {providerStatus?.mediaProviders.runway.configured ? 'Ready' : 'Key Needed'})
            </option>
            <option value="upload">Upload Local Clips / Images</option>
          </select>
        </div>

        <textarea
          rows={4}
          value={fullScript}
          onChange={(e) => setFullScript(e.target.value)}
          placeholder="Voiceover narration script (generated or custom)..."
          className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 text-xs text-slate-900 dark:text-slate-100"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleGenerateBlueprint}
            disabled={busyMsg !== null || !uid}
            className="min-h-[38px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate Script & Scenes (Steps 1–4)</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setScenes((prev) => [
                  ...prev,
                  {
                    index: prev.length + 1,
                    title: `Scene ${prev.length + 1}`,
                    durationSec: 5,
                    narration: '',
                    visualPrompt: `Dynamic futuristic visual for ${title}`,
                    overlayText: `Key Insight #${prev.length + 1}`,
                  },
                ])
              }
              className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200"
            >
              + Add Scene
            </button>
            {scenes.length > 0 && (
              <button
                type="button"
                onClick={handleGenerateAllStoryboards}
                disabled={busyMsg !== null}
                className="min-h-[36px] px-3 rounded-lg border border-cyan-600/35 dark:border-cyan-500/40 bg-cyan-50 dark:bg-cyan-500/10 text-xs text-cyan-800 dark:text-cyan-200"
              >
                Auto-Fill Missing Scene Frames
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step 6: Scene Breakdown & Asset Sourcing */}
      {scenes.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
            SCENE BREAKDOWN & ASSET ACQUISITION ({scenes.length} SCENES)
          </h4>
          {scenes.map((sc, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
                  SCENE {idx + 1}: {sc.title}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-slate-600 dark:text-slate-400">
                    Duration (s):
                    <input
                      type="number"
                      min={2}
                      max={60}
                      value={sc.durationSec}
                      onChange={(e) =>
                        setScenes((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, durationSec: Number(e.target.value) || 5 }
                              : item
                          )
                        )
                      }
                      className="ml-1.5 w-14 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] px-1.5 py-0.5 text-center font-mono-hud text-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <span className="font-mono-hud text-[11px] text-emerald-700 dark:text-emerald-300">
                    {sc.assetFilename ? `Asset: ${sc.assetSource}` : 'No asset yet'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={sc.visualPrompt}
                  onChange={(e) =>
                    setScenes((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, visualPrompt: e.target.value } : item
                      )
                    )
                  }
                  placeholder="Visual prompt / Pexels query"
                  className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-800 dark:text-slate-200"
                />
                <input
                  type="text"
                  value={sc.overlayText || ''}
                  onChange={(e) =>
                    setScenes((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, overlayText: e.target.value } : item
                      )
                    )
                  }
                  placeholder="On-screen overlay text"
                  className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateStoryboardAsset(idx)}
                  disabled={busyMsg !== null}
                  className="min-h-[34px] px-3 rounded-lg border border-cyan-600/35 dark:border-cyan-500/35 bg-cyan-50 dark:bg-cyan-500/10 text-xs text-cyan-800 dark:text-cyan-200"
                >
                  Generate Motion Frame
                </button>
                <button
                  type="button"
                  onClick={() => handlePexelsSearch(idx, sc.visualPrompt || sc.title)}
                  disabled={busyMsg !== null}
                  className="min-h-[34px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200"
                >
                  Search Pexels Stock
                </button>
                <button
                  type="button"
                  onClick={() => handleRunwayScene(idx, sc.visualPrompt || sc.title)}
                  disabled={busyMsg !== null}
                  className="min-h-[34px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200"
                >
                  Generate Runway Clip
                </button>
                <label className="min-h-[34px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer">
                  <Upload className="w-3 h-3" />
                  <span>Upload Clip/Image</span>
                  <input
                    type="file"
                    accept="video/*,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) handleUploadSceneAsset(idx, f);
                    }}
                  />
                </label>
              </div>

              {pexelsResults[idx]?.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                  {pexelsResults[idx].slice(0, 3).map((vid) => (
                    <button
                      key={vid.id}
                      type="button"
                      onClick={() => handleImportPexels(idx, vid.downloadUrl)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] p-1.5 text-left hover:border-cyan-500"
                    >
                      {vid.previewImage && (
                        <img
                          src={vid.previewImage}
                          alt="Pexels stock preview"
                          className="w-full h-20 object-cover rounded"
                        />
                      )}
                      <span className="block text-[10px] font-mono-hud text-cyan-700 dark:text-cyan-300 mt-1">
                        Import · {vid.duration}s ({vid.width}×{vid.height})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step 7 & 8: Voiceover, Music & Captions */}
      <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
        <h4 className="font-display text-sm font-semibold text-cyan-800 dark:text-cyan-200">
          VOICEOVER, BACKGROUND AUDIO & TIMED CAPTIONS (STEPS 7–8)
        </h4>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={voiceEngine}
            onChange={(e) => setVoiceEngine(e.target.value as 'gemini' | 'elevenlabs')}
            className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="gemini">Gemini Neural TTS (Charon / Kore / Fenrir)</option>
            <option value="elevenlabs">ElevenLabs Voice API</option>
          </select>

          {voiceEngine === 'gemini' && (
            <select
              value={geminiVoiceName}
              onChange={(e) => setGeminiVoiceName(e.target.value)}
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-800 dark:text-slate-200"
            >
              {['Charon', 'Puck', 'Kore', 'Fenrir', 'Zephyr'].map((v) => (
                <option key={v} value={v}>
                  Voice: {v}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleGenerateVoiceover}
            disabled={busyMsg !== null || !uid}
            className="min-h-[38px] px-4 rounded-lg bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 inline-flex items-center gap-1.5"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Synthesize Voice & Captions</span>
          </button>

          <label className="min-h-[38px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{musicFilename ? `Music: ${musicFilename}` : 'Upload Music Bed'}</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleMusicUpload}
            />
          </label>
        </div>

        {voiceoverUrl && (
          <audio controls src={voiceoverUrl} className="w-full h-10" />
        )}

        {captionsSrt && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                />
                <span>Burn Styled Subtitles into MP4 via FFmpeg</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadText('captions.srt', captionsSrt)}
                  className="text-cyan-700 dark:text-cyan-300 underline"
                >
                  Download .SRT
                </button>
                {captionsVtt && (
                  <button
                    type="button"
                    onClick={() => downloadText('captions.vtt', captionsVtt)}
                    className="text-cyan-700 dark:text-cyan-300 underline"
                  >
                    Download .VTT
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={4}
              value={captionsSrt}
              onChange={(e) => setCaptionsSrt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] p-2.5 font-mono-hud text-[11px] text-slate-700 dark:text-slate-300"
            />
          </div>
        )}
      </div>

      {/* Step 9–12: FFmpeg Render, FFprobe Check & Output */}
      <div className="rounded-xl border border-emerald-600/30 dark:border-emerald-500/30 bg-slate-50 dark:bg-[#050A14] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-display text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              COMPOSITION, FFMPEG RENDER & FFPROBE VERIFICATION (STEPS 9–12)
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Executes native FFmpeg encoding, mixes narration + audio bed, and validates
              output stream integrity with ffprobe.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRenderVideo}
            disabled={busyMsg !== null || !uid || scenes.length === 0}
            className="min-h-[42px] px-5 rounded-xl bg-emerald-600 dark:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-emerald-500 dark:hover:bg-emerald-300 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            <span>Render Final MP4</span>
          </button>
        </div>

        {renderedVideoUrl && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <video
                controls
                src={renderedVideoUrl}
                className="w-full max-h-[420px] rounded-xl border border-cyan-500/30 bg-black"
              />
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={renderedVideoUrl}
                  download={finalFilename}
                  className="min-h-[36px] px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download MP4</span>
                </a>
                <button
                  type="button"
                  onClick={() =>
                    onSendVideoToThumbnail(renderedVideoUrl, title, aspectRatio)
                  }
                  className="min-h-[36px] px-3.5 rounded-lg border border-cyan-600/35 dark:border-cyan-500/40 bg-cyan-50 dark:bg-cyan-500/10 text-xs text-cyan-800 dark:text-cyan-200 inline-flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Capture Thumbnail</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSendToPublish({
                      projectId,
                      title,
                      aspectRatio,
                      videoFilename: finalFilename,
                      videoUrl: renderedVideoUrl,
                      scriptSummary: fullScript,
                    })
                  }
                  className="min-h-[36px] px-4 rounded-lg bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Publishing</span>
                </button>
              </div>
            </div>

            {qualityReport && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-semibold text-slate-800 dark:text-slate-200">
                    FFPROBE QUALITY VERIFICATION
                  </span>
                  <span
                    className={`font-mono-hud text-xs font-semibold ${
                      qualityReport.passed
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {qualityReport.passed ? 'ALL CHECKS PASSED' : 'ATTENTION REQUIRED'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono-hud text-slate-700 dark:text-slate-300">
                  <div>
                    Resolution: {qualityReport.width}×{qualityReport.height}
                  </div>
                  <div>Duration: {qualityReport.durationSec.toFixed(1)}s</div>
                  <div>Video Codec: {qualityReport.videoCodec}</div>
                  <div>Audio Codec: {qualityReport.audioCodec || 'None'}</div>
                  <div>Bitrate: {qualityReport.bitrateKbps} kbps</div>
                  <div>
                    Size: {(qualityReport.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
                <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                  {qualityReport.checks.map((chk) => (
                    <div key={chk.label} className="flex items-center gap-2 text-xs">
                      {chk.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                      <span className="text-slate-800 dark:text-slate-200">{chk.label}:</span>
                      <span className="text-slate-600 dark:text-slate-400 font-mono-hud">
                        {chk.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 12: Saved Production Projects */}
      {projects.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5">
          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            PRODUCTION ARCHIVE ({projects.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {projects.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {p.title}
                  </p>
                  <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                    {p.aspectRatio} · Step {p.currentStep}/12 · {p.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => uid && deleteCreatorProject(uid, p.id)}
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                  aria-label="Delete project"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface ThumbnailStudioViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  initialTopic?: string;
  initialVideoUrl?: string;
  initialAspectRatio?: '9:16' | '16:9';
  onAttachThumbnailToPublish: (dataUrl: string) => void;
  onNotice: (msg: string) => void;
}

export const ThumbnailStudioView: React.FC<ThumbnailStudioViewProps> = ({
  uid,
  aiProvider,
  initialTopic,
  initialVideoUrl,
  initialAspectRatio,
  onAttachThumbnailToPublish,
  onNotice,
}) => {
  const [topic, setTopic] = useState(initialTopic || 'AI Automation Agents');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>(
    initialAspectRatio || '16:9'
  );
  const [headline, setHeadline] = useState('NEXT GEN AI AGENTS');
  const [subBadge, setSubBadge] = useState('LIVE DEMO');
  const [mood, setMood] = useState<'cyan' | 'amber' | 'crimson' | 'emerald'>('cyan');
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [concepts, setConcepts] = useState<
    Array<{
      headlineText: string;
      subBadge: string;
      focalSubject: string;
      colorMood: 'cyan' | 'amber' | 'crimson' | 'emerald';
      compositionNotes: string;
    }>
  >([]);
  const [aiBusy, setAiBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoCaptureRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [initialTopic, initialAspectRatio]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = aspectRatio === '16:9' ? 1280 : 1080;
    const h = aspectRatio === '16:9' ? 720 : 1920;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const moodMap = {
      cyan: { bg1: '#040914', bg2: '#0E3A54', accent: '#22D3EE' },
      emerald: { bg1: '#040C0B', bg2: '#0B3B2E', accent: '#34D399' },
      amber: { bg1: '#0D0804', bg2: '#422006', accent: '#FBBF24' },
      crimson: { bg1: '#0D0409', bg2: '#4C0519', accent: '#FB7185' },
    }[mood];

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, moodMap.bg1);
    grad.addColorStop(1, moodMap.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (bgImage) {
      const scale = Math.max(w / bgImage.width, h / bgImage.height);
      const dw = bgImage.width * scale;
      const dh = bgImage.height * scale;
      ctx.globalAlpha = 0.68;
      ctx.drawImage(bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;

      const vignette = ctx.createLinearGradient(0, 0, w, 0);
      vignette.addColorStop(0, 'rgba(4,7,13,0.92)');
      vignette.addColorStop(0.65, 'rgba(4,7,13,0.42)');
      vignette.addColorStop(1, 'rgba(4,7,13,0.2)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    } else {
      // HUD graphic accent rings
      ctx.strokeStyle = moodMap.accent;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.5, Math.min(w, h) * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Sub-badge
    const padX = w * 0.06;
    const badgeY = aspectRatio === '16:9' ? h * 0.22 : h * 0.32;
    if (subBadge.trim()) {
      ctx.fillStyle = moodMap.accent;
      ctx.font = 'bold 34px "JetBrains Mono", monospace';
      const bw = ctx.measureText(subBadge.toUpperCase()).width + 44;
      ctx.fillRect(padX, badgeY - 40, bw, 56);
      ctx.fillStyle = '#04070D';
      ctx.textAlign = 'left';
      ctx.fillText(subBadge.toUpperCase(), padX + 22, badgeY);
    }

    // Headline Text with high-contrast stroke + fill
    const words = headline.toUpperCase().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    ctx.font = `900 ${aspectRatio === '16:9' ? 98 : 92}px "Chakra Petch", sans-serif`;
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > w * 0.84) {
        if (cur) lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);

    const lineHeight = aspectRatio === '16:9' ? 112 : 106;
    const startY = badgeY + 120;
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    lines.slice(0, 4).forEach((ln, idx) => {
      const y = startY + idx * lineHeight;
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#020617';
      ctx.strokeText(ln, padX, y);
      ctx.fillStyle = idx === lines.length - 1 ? moodMap.accent : '#F8FAFC';
      ctx.fillText(ln, padX, y);
    });
  }, [aspectRatio, bgImage, headline, mood, subBadge]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleUploadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.src = URL.createObjectURL(file);
  };

  const handleCaptureVideoFrame = () => {
    const vid = videoCaptureRef.current;
    if (!vid) return;
    const c = document.createElement('canvas');
    c.width = vid.videoWidth || 1280;
    c.height = vid.videoHeight || 720;
    c.getContext('2d')?.drawImage(vid, 0, 0, c.width, c.height);
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.src = c.toDataURL('image/png');
  };

  const handleGenerateConcepts = async () => {
    if (!uid) return;
    setAiBusy(true);
    try {
      const res = await creatorFetchJson<{
        result: typeof concepts;
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'thumbnail_concept',
          provider: aiProvider,
          payload: { topic },
        }),
      });
      setConcepts(Array.isArray(res.result) ? res.result : []);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Concept generation failed.');
    } finally {
      setAiBusy(false);
    }
  };

  const exportThumbnail = (mime: 'image/png' | 'image/jpeg') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL(mime, 0.92);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thumbnail_${aspectRatio.replace(':', 'x')}.${
      mime === 'image/png' ? 'png' : 'jpg'
    }`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 space-y-3 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
              THUMBNAIL DESIGN STUDIO (1280×720 · 1080×1920)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              High-contrast canvas compositor with AI concept art direction, video frame
              capture, and instant PNG/JPG export
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateConcepts}
            disabled={aiBusy || !uid}
            className="min-h-[38px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 inline-flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>{aiBusy ? 'Designing...' : 'AI Thumbnail Concepts'}</span>
          </button>
        </div>

        {concepts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
            {concepts.map((c, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setHeadline(c.headlineText);
                  setSubBadge(c.subBadge);
                  setMood(c.colorMood || 'cyan');
                }}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3 hover:border-cyan-500/60 space-y-1"
              >
                <span className="text-[10px] font-mono-hud uppercase text-cyan-700 dark:text-cyan-300">
                  {c.subBadge} · {c.colorMood}
                </span>
                <p className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  {c.headlineText}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {c.compositionNotes}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Video Topic"
            className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Thumbnail Headline (3–5 words)"
            className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 font-semibold"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={subBadge}
              onChange={(e) => setSubBadge(e.target.value)}
              placeholder="Badge text"
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
            />
            <select
              value={mood}
              onChange={(e) =>
                setMood(e.target.value as 'cyan' | 'amber' | 'crimson' | 'emerald')
              }
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="cyan">Mood: Neon Cyan</option>
              <option value="emerald">Mood: Emerald Matrix</option>
              <option value="amber">Mood: Solar Amber</option>
              <option value="crimson">Mood: Crimson Alert</option>
            </select>
          </div>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16')}
            className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="16:9">16:9 YouTube Standard (1280×720)</option>
            <option value="9:16">9:16 Reels / Shorts Cover (1080×1920)</option>
          </select>

          <div className="flex flex-wrap gap-2">
            <label className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Backdrop</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadBg}
              />
            </label>
            {bgImage && (
              <button
                type="button"
                onClick={() => setBgImage(null)}
                className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400"
              >
                Clear Backdrop
              </button>
            )}
          </div>

          {initialVideoUrl && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <video
                ref={videoCaptureRef}
                src={initialVideoUrl}
                controls
                crossOrigin="anonymous"
                className="w-full max-h-36 rounded-lg bg-black"
              />
              <button
                type="button"
                onClick={handleCaptureVideoFrame}
                className="w-full min-h-[34px] rounded-lg border border-cyan-600/35 dark:border-cyan-500/40 bg-cyan-50 dark:bg-cyan-500/10 text-xs text-cyan-800 dark:text-cyan-200"
              >
                Use Current Video Frame as Backdrop
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => exportThumbnail('image/png')}
              className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PNG</span>
            </button>
            <button
              type="button"
              onClick={() => exportThumbnail('image/jpeg')}
              className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JPG</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const url = canvasRef.current?.toDataURL('image/jpeg', 0.9);
                if (url) {
                  onAttachThumbnailToPublish(url);
                  onNotice('Thumbnail attached to Publishing Manager.');
                }
              }}
              className="min-h-[36px] px-3.5 rounded-lg bg-emerald-600 dark:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-emerald-500 dark:hover:bg-emerald-300"
            >
              Attach to Publish
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className={`max-w-full rounded-lg border border-slate-300 dark:border-slate-800 ${
              aspectRatio === '9:16' ? 'max-h-[460px]' : 'w-full'
            }`}
          />
        </div>
      </div>
    </div>
  );
};

interface SeoAssistantViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  initialTopic?: string;
  initialScript?: string;
  onApplyToPublish: (platform: SocialPlatformId, title: string, caption: string, tags: string[]) => void;
  onNotice: (msg: string) => void;
}

export const SeoAssistantView: React.FC<SeoAssistantViewProps> = ({
  uid,
  aiProvider,
  initialTopic,
  initialScript,
  onApplyToPublish,
  onNotice,
}) => {
  const [topic, setTopic] = useState(initialTopic || '');
  const [script, setScript] = useState(initialScript || '');
  const [seo, setSeo] = useState<PlatformSeoMetadata | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
    if (initialScript) setScript(initialScript);
  }, [initialTopic, initialScript]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !topic.trim()) return;
    setBusy(true);
    try {
      const res = await creatorFetchJson<{ result: PlatformSeoMetadata }>(
        '/api/creator/ai/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            task: 'seo',
            provider: aiProvider,
            payload: { topic: topic.trim(), script },
          }),
        }
      );
      setSeo(res.result);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'SEO generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (txt: string) => {
    await navigator.clipboard.writeText(txt);
    onNotice('Copied to clipboard.');
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 space-y-3 shadow-sm dark:shadow-none"
      >
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            MULTI-PLATFORM SEO & METADATA ENGINE
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Generates distinct, algorithm-native titles, descriptions, hashtags, and posts
            for YouTube, Instagram, Facebook, X, and LinkedIn.
          </p>
        </div>

        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Video / Campaign Topic..."
          className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100"
        />
        <textarea
          rows={3}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Optional script or key takeaways for richer chaptering & copy..."
          className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3 text-xs text-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={busy || !uid || !topic.trim()}
          className="min-h-[40px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50"
        >
          {busy ? 'Crafting Platform Metadata...' : 'Generate Platform-Specific SEO'}
        </button>
      </form>

      {seo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* YouTube */}
          <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                YOUTUBE METADATA
              </span>
              <button
                type="button"
                onClick={() =>
                  onApplyToPublish(
                    'youtube',
                    seo.youtubeTitles?.[0] || topic,
                    `${seo.youtubeDescription || ''}\n\n${(seo.youtubeHashtags || []).join(' ')}`,
                    seo.youtubeKeywords || []
                  )
                }
                className="text-xs text-emerald-700 dark:text-emerald-300 underline"
              >
                Use for YouTube Publish
              </button>
            </div>
            {(seo.youtubeTitles || []).map((t, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between gap-2"
              >
                <span>{t}</span>
                <button
                  type="button"
                  onClick={() => copyText(t)}
                  className="text-cyan-700 dark:text-cyan-300"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-2.5">
              {seo.youtubeDescription}
            </p>
            <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
              Keywords: {(seo.youtubeKeywords || []).join(', ')}
            </p>
          </div>

          {/* Instagram, Facebook, X, LinkedIn */}
          <div className="space-y-3">
            {[
              {
                platform: 'instagram' as SocialPlatformId,
                label: 'INSTAGRAM REELS',
                text: `${seo.instagramCaption || ''}\n\n${(
                  seo.instagramHashtags || []
                ).join(' ')}`.trim(),
              },
              {
                platform: 'facebook' as SocialPlatformId,
                label: 'FACEBOOK VIDEO',
                text: seo.facebookCaption || '',
              },
              {
                platform: 'x' as SocialPlatformId,
                label: 'X (TWITTER)',
                text: seo.xPost || '',
              },
              {
                platform: 'linkedin' as SocialPlatformId,
                label: 'LINKEDIN POST',
                text: seo.linkedinPost || '',
              },
            ].map((blk) => (
              <div
                key={blk.platform}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-semibold text-slate-800 dark:text-slate-200">
                    {blk.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => copyText(blk.text)}
                      className="text-cyan-700 dark:text-cyan-300 hover:underline"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onApplyToPublish(blk.platform, topic, blk.text, [])
                      }
                      className="text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                      Send to Publish
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {blk.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface PublishingManagerViewProps {
  uid: string | null;
  providerStatus: CreatorProviderStatus | null;
  projects: CreatorProjectDoc[];
  posts: CreatorPostDoc[];
  draftPublish?: {
    platform?: SocialPlatformId;
    projectId?: string;
    videoFilename?: string;
    videoUrl?: string;
    title?: string;
    caption?: string;
    tags?: string[];
    isShort?: boolean;
    thumbnailDataUrl?: string;
  } | null;
  onRequestConfirm: (dlg: ConfirmDialogState) => void;
  onNotice: (msg: string) => void;
}

export const PublishingManagerView: React.FC<PublishingManagerViewProps> = ({
  uid,
  providerStatus,
  projects,
  posts,
  draftPublish,
  onRequestConfirm,
  onNotice,
}) => {
  const [platform, setPlatform] = useState<SocialPlatformId>(
    draftPublish?.platform || 'youtube'
  );
  const [title, setTitle] = useState(draftPublish?.title || '');
  const [description, setDescription] = useState(draftPublish?.caption || '');
  const [tagsRaw, setTagsRaw] = useState((draftPublish?.tags || []).join(', '));
  const [privacyStatus, setPrivacyStatus] = useState<'private' | 'unlisted' | 'public'>(
    'private'
  );
  const [scheduledAt, setScheduledAt] = useState('');
  const [isShort, setIsShort] = useState(Boolean(draftPublish?.isShort));
  const [selectedProjectId, setSelectedProjectId] = useState(
    draftPublish?.projectId || ''
  );
  const [videoFilename, setVideoFilename] = useState(draftPublish?.videoFilename || '');
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState(
    draftPublish?.thumbnailDataUrl || ''
  );
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!draftPublish) return;
    if (draftPublish.platform) setPlatform(draftPublish.platform);
    if (draftPublish.title !== undefined) setTitle(draftPublish.title);
    if (draftPublish.caption !== undefined) setDescription(draftPublish.caption);
    if (draftPublish.tags) setTagsRaw(draftPublish.tags.join(', '));
    if (draftPublish.projectId) setSelectedProjectId(draftPublish.projectId);
    if (draftPublish.videoFilename) setVideoFilename(draftPublish.videoFilename);
    if (draftPublish.isShort !== undefined) setIsShort(draftPublish.isShort);
    if (draftPublish.thumbnailDataUrl) setThumbnailDataUrl(draftPublish.thumbnailDataUrl);
  }, [draftPublish]);

  const isPlatformConnected =
    platform === 'telegram'
      ? Boolean(providerStatus?.mediaProviders.telegram.configured)
      : Boolean(providerStatus?.oauth?.[platform]?.connected);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const resolvedVideoFile = videoFilename || selectedProject?.finalVideoPath || '';

  const handleOpenConfirmPublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    onRequestConfirm({
      open: true,
      title: `Confirm Publish to ${platform.toUpperCase()}`,
      description: `You are about to publish directly to your connected ${platform.toUpperCase()} account.\n\nTitle: ${
        title || '(Using caption)'
      }\nVisibility: ${
        scheduledAt ? `Scheduled (${scheduledAt})` : privacyStatus.toUpperCase()
      }\nVideo Asset: ${resolvedVideoFile || 'Text / Post only'}`,
      confirmLabel: `Publish to ${platform.toUpperCase()}`,
      variant: 'primary',
      onConfirm: async () => {
        setPublishing(true);
        const tags = tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        try {
          const res = await creatorFetchJson<{
            published: boolean;
            platform: string;
            externalPostId?: string;
            externalUrl?: string;
          }>('/api/creator/publish', {
            method: 'POST',
            body: JSON.stringify({
              platform,
              confirmed: true,
              title,
              description,
              tags,
              privacyStatus,
              scheduledAt: scheduledAt || undefined,
              isShort,
              projectId: selectedProjectId || undefined,
              videoFilename: resolvedVideoFile || undefined,
              thumbnailBase64: thumbnailDataUrl || undefined,
            }),
          });

          await addCreatorPost(uid, {
            platform,
            title: title || description.slice(0, 80) || `${platform} post`,
            caption: description,
            status: scheduledAt ? 'scheduled' : 'published',
            externalPostId: res.externalPostId,
            externalUrl: res.externalUrl,
          });
          onNotice(
            `Published to ${platform.toUpperCase()}! ID: ${res.externalPostId || 'confirmed'}`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Publishing failed.';
          await addCreatorPost(uid, {
            platform,
            title: title || `${platform} publish attempt`,
            caption: description,
            status: 'failed',
            errorMessage: msg,
          });
          onNotice(`Publish error (${platform}): ${msg}`);
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 flex flex-wrap items-center justify-between gap-2 shadow-sm dark:shadow-none">
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            SOCIAL PUBLISHING MANAGER & PREVIEW GATE
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Explicit pre-publish verification required before any public API upload or post.
          </p>
        </div>
        <span
          className={`text-xs font-mono-hud ${
            isPlatformConnected
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-amber-700 dark:text-amber-300'
          }`}
        >
          {platform.toUpperCase()} ACCOUNT:{' '}
          {isPlatformConnected ? 'CONNECTED' : 'NOT CONNECTED'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <form
          onSubmit={handleOpenConfirmPublish}
          className="lg:col-span-7 rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SocialPlatformId)}
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="youtube">YouTube (Video / Shorts)</option>
              <option value="instagram">Instagram Reels</option>
              <option value="facebook">Facebook Page Video</option>
              <option value="telegram">Telegram Channel</option>
              <option value="x">X (Twitter) Post</option>
              <option value="linkedin">LinkedIn Post</option>
            </select>

            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                const found = projects.find((p) => p.id === e.target.value);
                if (found?.finalVideoPath) setVideoFilename(found.finalVideoPath);
                if (found) setIsShort(found.aspectRatio === '9:16');
              }}
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="">No Rendered Video (Text/Link Only)</option>
              {projects
                .filter((p) => p.finalVideoPath)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.aspectRatio})
                  </option>
                ))}
            </select>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (YouTube / Facebook / Telegram header)"
            className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
          />

          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description / Reel Caption / Post Copy..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 text-xs text-slate-900 dark:text-slate-100"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="Comma-separated tags"
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
            />
            <select
              value={privacyStatus}
              onChange={(e) =>
                setPrivacyStatus(e.target.value as 'private' | 'unlisted' | 'public')
              }
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="private">Visibility: Private</option>
              <option value="unlisted">Visibility: Unlisted</option>
              <option value="public">Visibility: Public</option>
            </select>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-2.5 text-xs text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isShort}
                onChange={(e) => setIsShort(e.target.checked)}
              />
              <span>Tag as #Shorts (Vertical)</span>
            </label>

            <button
              type="submit"
              disabled={publishing || !uid || !isPlatformConnected}
              className="min-h-[40px] px-5 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{publishing ? 'Uploading...' : 'Review & Confirm Publish'}</span>
            </button>
          </div>
        </form>

        {/* Pre-Publish Inspection Preview */}
        <div className="lg:col-span-5 rounded-xl border border-emerald-600/25 dark:border-emerald-500/25 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-display text-xs font-semibold">
            <ShieldAlert className="w-4 h-4" />
            <span>PRE-PUBLISH VERIFICATION PREVIEW</span>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Destination:</span>
              <span className="font-mono-hud text-cyan-700 dark:text-cyan-300">
                {platform.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Rendered MP4:</span>
              <span className="font-mono-hud text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                {resolvedVideoFile || 'None selected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Visibility:</span>
              <span className="font-mono-hud text-slate-800 dark:text-slate-200">
                {scheduledAt ? `Scheduled ${scheduledAt}` : privacyStatus.toUpperCase()}
              </span>
            </div>
            {thumbnailDataUrl && (
              <div className="pt-1">
                <span className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Attached Thumbnail:
                </span>
                <img
                  src={thumbnailDataUrl}
                  alt="Attached thumbnail preview"
                  className="w-full max-h-36 object-contain rounded border border-slate-200 dark:border-slate-800"
                />
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Clicking "Review & Confirm Publish" opens an explicit confirmation modal
            before any data leaves J.A.R.V.I.S.
          </p>
        </div>
      </div>

      {/* Publishing History */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          PUBLISHED POSTS & UPLOAD LOG ({posts.length})
        </h4>
        <div className="space-y-2">
          {posts.map((post) => (
            <div
              key={post.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  [{post.platform.toUpperCase()}] {post.title}
                </p>
                <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                  Status: {post.status.toUpperCase()}
                  {post.externalPostId ? ` · ID: ${post.externalPostId}` : ''}
                  {post.errorMessage ? ` · Error: ${post.errorMessage}` : ''}
                </p>
              </div>
              {post.externalUrl && (
                <a
                  href={post.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-700 dark:text-cyan-300 hover:text-cyan-600 dark:hover:text-cyan-200 inline-flex items-center gap-1 shrink-0"
                >
                  <span>View</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
          {posts.length === 0 && (
            <p className="text-xs text-slate-500">No publishing attempts recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
