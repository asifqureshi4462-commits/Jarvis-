import { auth } from './firebase';

export async function getCreatorAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with Google to authenticate Creator Studio.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

export async function creatorFetchJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const isJsonBody =
    options.body !== undefined &&
    !(options.body instanceof ArrayBuffer) &&
    !(options.body instanceof Uint8Array) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof FormData);

  const authHeaders = await getCreatorAuthHeaders(
    isJsonBody ? { 'Content-Type': 'application/json' } : {}
  );

  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`
    ) as Error & { needsKey?: string; missingEnv?: string[]; callbackUrl?: string };
    err.needsKey = (data as { needsKey?: string }).needsKey;
    err.missingEnv = (data as { missingEnv?: string[] }).missingEnv;
    err.callbackUrl = (data as { callbackUrl?: string }).callbackUrl;
    throw err;
  }
  return data as T;
}

export async function uploadProjectBinaryAsset(
  projectId: string,
  filename: string,
  blobOrFile: Blob
): Promise<{ filename: string; sizeBytes: number; previewUrl: string }> {
  const authHeaders = await getCreatorAuthHeaders({
    'Content-Type': blobOrFile.type || 'application/octet-stream',
  });
  const res = await fetch(
    `/api/creator/video/upload-asset?projectId=${encodeURIComponent(
      projectId
    )}&filename=${encodeURIComponent(filename)}`,
    {
      method: 'POST',
      headers: authHeaders,
      body: blobOrFile,
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Upload failed (${res.status})`
    );
  }
  return data as { filename: string; sizeBytes: number; previewUrl: string };
}
