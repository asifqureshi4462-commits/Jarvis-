import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const BASE_STORAGE_DIR = path.resolve(
  process.cwd(),
  "storage",
  "creator-projects"
);

export function sanitizeSegment(seg: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(seg)) {
    throw new Error("Invalid identifier format.");
  }
  return seg;
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name);
  if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(base) || base.includes("..")) {
    throw new Error("Invalid media filename.");
  }
  return base;
}

export function resolveProjectDir(uid: string, projectId: string): string {
  const safeUid = sanitizeSegment(uid);
  const safeProj = sanitizeSegment(projectId);
  const resolved = path.resolve(BASE_STORAGE_DIR, safeUid, safeProj);
  if (!resolved.startsWith(BASE_STORAGE_DIR + path.sep)) {
    throw new Error("Path confinement violation.");
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function resolveProjectFile(
  uid: string,
  projectId: string,
  filename: string
): string {
  const dir = resolveProjectDir(uid, projectId);
  const safeFile = sanitizeFilename(filename);
  const resolved = path.resolve(dir, safeFile);
  if (!resolved.startsWith(dir + path.sep)) {
    throw new Error("File path confinement violation.");
  }
  return resolved;
}

const ALLOWED_MEDIA_HOSTS = [
  "pexels.com",
  "videos.pexels.com",
  "images.pexels.com",
  "runwayml.com",
  "cdn.runwayml.com",
  "dnznrvs05pmza.cloudfront.net",
  "storage.googleapis.com",
];

function assertSafeRemoteMediaUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS media URLs are permitted.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("Private network URLs are forbidden.");
  }
  const allowed = ALLOWED_MEDIA_HOSTS.some(
    (h) => host === h || host.endsWith(`.${h}`)
  );
  if (!allowed) {
    throw new Error(`Media host "${host}" is not in the licensed provider allowlist.`);
  }
  return parsed;
}

export async function downloadLicensedMedia(
  rawUrl: string,
  destPath: string
): Promise<{ sizeBytes: number; contentType: string }> {
  const safeUrl = assertSafeRemoteMediaUrl(rawUrl);
  const res = await fetch(safeUrl.toString());
  if (!res.ok) {
    throw new Error(`Failed to retrieve licensed asset (${res.status}).`);
  }
  const contentType = res.headers.get("content-type") || "video/mp4";
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  if (buf.length === 0 || buf.length > 90 * 1024 * 1024) {
    throw new Error("Downloaded media asset size is invalid or exceeds 90MB.");
  }
  fs.writeFileSync(destPath, buf);
  return { sizeBytes: buf.length, contentType };
}

export async function searchPexelsVideos(params: {
  apiKey: string;
  query: string;
  aspectRatio: "9:16" | "16:9";
  perPage?: number;
}) {
  const orientation = params.aspectRatio === "9:16" ? "portrait" : "landscape";
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", params.query.slice(0, 120));
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("per_page", String(params.perPage || 6));

  const res = await fetch(url.toString(), {
    headers: { Authorization: params.apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pexels API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    videos?: Array<{
      id: number;
      duration: number;
      image: string;
      url: string;
      user?: { name?: string };
      video_files?: Array<{
        id: number;
        quality: string;
        file_type: string;
        width: number;
        height: number;
        link: string;
      }>;
    }>;
  };

  return (data.videos || []).map((v) => {
    const mp4Files = (v.video_files || []).filter((f) =>
      f.file_type.includes("mp4")
    );
    const preferred =
      mp4Files.find((f) => f.quality === "hd") || mp4Files[0] || v.video_files?.[0];
    return {
      id: String(v.id),
      duration: v.duration,
      thumbnail: v.image,
      author: v.user?.name || "Pexels Creator",
      licenseUrl: v.url,
      downloadUrl: preferred?.link || "",
      width: preferred?.width || 0,
      height: preferred?.height || 0,
    };
  });
}

export async function generateRunwayClip(params: {
  apiKey: string;
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  durationSec?: 5 | 10;
  imageUrl?: string;
}): Promise<{ taskId: string; videoUrl: string }> {
  const ratio = params.aspectRatio === "9:16" ? "720:1280" : "1280:720";
  const endpoint = params.imageUrl
    ? "https://api.dev.runwayml.com/v1/image_to_video"
    : "https://api.dev.runwayml.com/v1/text_to_video";

  const body: Record<string, unknown> = params.imageUrl
    ? {
        model: "gen4_turbo",
        promptImage: params.imageUrl,
        promptText: params.prompt.slice(0, 900),
        ratio,
        duration: params.durationSec || 5,
      }
    : {
        model: "veo3.1_fast",
        promptText: params.prompt.slice(0, 900),
        ratio,
        duration: params.durationSec === 10 ? 8 : 6,
      };

  const createRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "X-Runway-Version": "2024-11-06",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Runway API error (${createRes.status}): ${errText}`);
  }

  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    throw new Error("Runway API did not return a generation task ID.");
  }

  // Poll up to ~90 seconds
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(
      `https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(created.id)}`,
      {
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
      }
    );
    if (!pollRes.ok) continue;
    const task = (await pollRes.json()) as {
      status?: string;
      output?: string[];
      failure?: string;
    };
    if (task.status === "SUCCEEDED" && task.output?.[0]) {
      return { taskId: created.id, videoUrl: task.output[0] };
    }
    if (task.status === "FAILED") {
      throw new Error(task.failure || "Runway video generation failed.");
    }
  }

  throw new Error(
    `Runway task ${created.id} is still processing. Retry checking status shortly.`
  );
}

export async function probeMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    const dur = Number(parsed.format?.duration || 0);
    return Number.isFinite(dur) ? dur : 0;
  } catch {
    return 0;
  }
}

function formatSrtTime(sec: number): string {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s
  ).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatVttTime(sec: number): string {
  return formatSrtTime(sec).replace(",", ".");
}

export function generateSubtitlesFromScript(
  narrationText: string,
  totalDurationSec: number
): { srt: string; vtt: string } {
  const cleaned = narrationText
    .replace(/\[.*?\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const rawChunks = cleaned
    .split(/(?<=[.!?।۔])\s+/)
    .flatMap((sentence) => {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      const segments: string[] = [];
      for (let i = 0; i < words.length; i += 8) {
        segments.push(words.slice(i, i + 8).join(" "));
      }
      return segments;
    })
    .filter(Boolean);

  if (rawChunks.length === 0) {
    return {
      srt: `1\n00:00:00,000 --> ${formatSrtTime(Math.max(3, totalDurationSec))}\nJ.A.R.V.I.S Creator Production\n`,
      vtt: `WEBVTT\n\n00:00:00.000 --> ${formatVttTime(Math.max(3, totalDurationSec))}\nJ.A.R.V.I.S Creator Production\n`,
    };
  }

  const totalChars = rawChunks.reduce((acc, s) => acc + s.length, 0) || 1;
  const duration = Math.max(3, totalDurationSec);
  let cursor = 0;

  const srtBlocks: string[] = [];
  const vttBlocks: string[] = ["WEBVTT", ""];

  rawChunks.forEach((line, idx) => {
    const share = (line.length / totalChars) * duration;
    const start = cursor;
    const end = idx === rawChunks.length - 1 ? duration : Math.min(duration, cursor + share);
    cursor = end;

    srtBlocks.push(
      `${idx + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${line}\n`
    );
    vttBlocks.push(`${formatVttTime(start)} --> ${formatVttTime(end)}\n${line}\n`);
  });

  return {
    srt: srtBlocks.join("\n"),
    vtt: vttBlocks.join("\n"),
  };
}

export interface RenderSceneInput {
  title: string;
  overlayText?: string;
  durationSec: number;
  assetFilename?: string;
}

export interface VideoQualityReport {
  passed: boolean;
  width: number;
  height: number;
  expectedResolution: string;
  aspectRatio: "9:16" | "16:9";
  durationSec: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  bitrateKbps: number;
  fileSizeBytes: number;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
}

export async function renderCreatorVideo(params: {
  uid: string;
  projectId: string;
  aspectRatio: "9:16" | "16:9";
  scenes: RenderSceneInput[];
  voiceoverFilename?: string;
  musicFilename?: string;
  burnCaptions?: boolean;
  captionsFilename?: string;
}): Promise<{ finalFilename: string; quality: VideoQualityReport }> {
  const projectDir = resolveProjectDir(params.uid, params.projectId);
  const width = params.aspectRatio === "9:16" ? 1080 : 1920;
  const height = params.aspectRatio === "9:16" ? 1920 : 1080;

  const voicePath = params.voiceoverFilename
    ? resolveProjectFile(params.uid, params.projectId, params.voiceoverFilename)
    : null;
  const hasVoice = Boolean(voicePath && fs.existsSync(voicePath));
  const voiceDur = hasVoice && voicePath ? await probeMediaDuration(voicePath) : 0;

  const musicPath = params.musicFilename
    ? resolveProjectFile(params.uid, params.projectId, params.musicFilename)
    : null;
  const hasMusic = Boolean(musicPath && fs.existsSync(musicPath));

  const scenes = params.scenes.length > 0 ? params.scenes : [{ title: "Scene 1", durationSec: 6 }];
  const rawTotal = scenes.reduce((s, sc) => s + Math.max(2, sc.durationSec || 5), 0);
  const targetTotal = voiceDur > 0 ? Math.max(voiceDur + 0.5, rawTotal) : rawTotal;
  const scaleFactor = rawTotal > 0 ? targetTotal / rawTotal : 1;

  // Normalize each scene into an individual uniform MP4 segment (safe against mixed codecs/resolutions)
  const segmentPaths: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = Math.max(2, Number(((sc.durationSec || 5) * scaleFactor).toFixed(2)));
    const segPath = resolveProjectFile(
      params.uid,
      params.projectId,
      `__seg_${i}.mp4`
    );

    const assetPath = sc.assetFilename
      ? resolveProjectFile(params.uid, params.projectId, sc.assetFilename)
      : null;
    const assetExists = Boolean(assetPath && fs.existsSync(assetPath));
    const ext = assetPath ? path.extname(assetPath).toLowerCase() : "";
    const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
    const isVideo = [".mp4", ".mov", ".webm", ".mkv"].includes(ext);

    if (assetExists && assetPath && isVideo) {
      await execFileAsync("ffmpeg", [
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        assetPath,
        "-t",
        String(dur),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,setsar=1,format=yuv420p`,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        segPath,
      ]);
    } else if (assetExists && assetPath && isImage) {
      const frames = Math.max(60, Math.round(dur * 30));
      await execFileAsync("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-i",
        assetPath,
        "-vf",
        `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${
          width * 2
        }:${height * 2},zoompan=z='min(zoom+0.0008,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=30,setsar=1,format=yuv420p`,
        "-t",
        String(dur),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        segPath,
      ]);
    } else {
      // Fallback: render clean dark HUD motion card with scene title text via drawtext
      const cleanLabel = (sc.overlayText || sc.title || `Scene ${i + 1}`)
        .replace(/[':\\]/g, " ")
        .slice(0, 64);
      await execFileAsync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x04070D:s=${width}x${height}:r=30:d=${dur}`,
        "-vf",
        `drawbox=x=48:y=48:w=${width - 96}:h=${height - 96}:color=0x22d3ee@0.35:t=2,drawtext=text='${cleanLabel}':fontcolor=0xE2E8F0:fontsize=${
          params.aspectRatio === "9:16" ? 42 : 48
        }:x=(w-text_w)/2:y=(h-text_h)/2`,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        segPath,
      ]);
    }
    segmentPaths.push(segPath);
  }

  const concatListPath = resolveProjectFile(
    params.uid,
    params.projectId,
    "__concat.txt"
  );
  fs.writeFileSync(
    concatListPath,
    segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8"
  );

  const finalFilename = `jarvis_render_${params.aspectRatio.replace(":", "x")}.mp4`;
  const finalPath = resolveProjectFile(
    params.uid,
    params.projectId,
    finalFilename
  );

  const captionsPath =
    params.burnCaptions && params.captionsFilename
      ? resolveProjectFile(params.uid, params.projectId, params.captionsFilename)
      : null;
  const hasCaptions = Boolean(captionsPath && fs.existsSync(captionsPath));

  const ffmpegArgs: string[] = ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath];
  let audioInputIdx = 1;
  let voiceIdx = -1;
  let musicIdx = -1;

  if (hasVoice && voicePath) {
    ffmpegArgs.push("-i", voicePath);
    voiceIdx = audioInputIdx++;
  }
  if (hasMusic && musicPath) {
    ffmpegArgs.push("-stream_loop", "-1", "-i", musicPath);
    musicIdx = audioInputIdx++;
  }

  const filterParts: string[] = [];
  let videoMap = "0:v";
  if (hasCaptions && captionsPath) {
    const escapedSrt = captionsPath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'");
    filterParts.push(
      `[0:v]subtitles='${escapedSrt}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=3,Outline=1,MarginV=44'[vout]`
    );
    videoMap = "[vout]";
  }

  let audioMap: string | null = null;
  if (voiceIdx >= 0 && musicIdx >= 0) {
    filterParts.push(
      `[${voiceIdx}:a]volume=1.0[va];[${musicIdx}:a]volume=0.18[ma];[va][ma]amix=inputs=2:duration=first:dropout_transition=2[aout]`
    );
    audioMap = "[aout]";
  } else if (voiceIdx >= 0) {
    audioMap = `${voiceIdx}:a`;
  } else if (musicIdx >= 0) {
    filterParts.push(`[${musicIdx}:a]volume=0.25[aout]`);
    audioMap = "[aout]";
  }

  if (filterParts.length > 0) {
    ffmpegArgs.push("-filter_complex", filterParts.join(";"));
  }
  ffmpegArgs.push("-map", videoMap);
  if (audioMap) {
    ffmpegArgs.push("-map", audioMap, "-c:a", "aac", "-b:a", "192k", "-shortest");
  }

  ffmpegArgs.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    finalPath
  );

  await execFileAsync("ffmpeg", ffmpegArgs);

  // Clean temporary segments
  for (const seg of segmentPaths) {
    try {
      fs.unlinkSync(seg);
    } catch {
      // Ignore cleanup errors
    }
  }
  try {
    fs.unlinkSync(concatListPath);
  } catch {
    // Ignore
  }

  const quality = await probeVideoQuality(finalPath, params.aspectRatio);
  return { finalFilename, quality };
}

export async function probeVideoQuality(
  videoPath: string,
  aspectRatio: "9:16" | "16:9"
): Promise<VideoQualityReport> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath,
  ]);
  const data = JSON.parse(stdout) as {
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
    format?: {
      duration?: string;
      size?: string;
      bit_rate?: string;
    };
  };

  const vStream = data.streams?.find((s) => s.codec_type === "video");
  const aStream = data.streams?.find((s) => s.codec_type === "audio");

  const width = vStream?.width || 0;
  const height = vStream?.height || 0;
  const expectedWidth = aspectRatio === "9:16" ? 1080 : 1920;
  const expectedHeight = aspectRatio === "9:16" ? 1920 : 1080;
  const durationSec = Number(data.format?.duration || 0);
  const fileSizeBytes = Number(data.format?.size || fs.statSync(videoPath).size);
  const bitrateKbps = Math.round(Number(data.format?.bit_rate || 0) / 1000);

  const checks = [
    {
      label: "Resolution Match",
      passed: width === expectedWidth && height === expectedHeight,
      detail: `${width}x${height} (expected ${expectedWidth}x${expectedHeight})`,
    },
    {
      label: "H.264 Broadcast Codec",
      passed: vStream?.codec_name === "h264",
      detail: vStream?.codec_name || "none",
    },
    {
      label: "Playable Duration",
      passed: durationSec >= 1.5,
      detail: `${durationSec.toFixed(2)}s`,
    },
    {
      label: "Audio Track Present",
      passed: Boolean(aStream),
      detail: aStream ? `${aStream.codec_name} audio stream verified` : "No audio stream attached",
    },
    {
      label: "Non-Empty Output File",
      passed: fileSizeBytes > 5000,
      detail: `${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
    },
  ];

  const passed = checks.slice(0, 3).every((c) => c.passed) && checks[4].passed;

  return {
    passed,
    width,
    height,
    expectedResolution: `${expectedWidth}x${expectedHeight}`,
    aspectRatio,
    durationSec,
    videoCodec: vStream?.codec_name || "unknown",
    audioCodec: aStream?.codec_name || null,
    hasAudio: Boolean(aStream),
    bitrateKbps,
    fileSizeBytes,
    checks,
  };
}
