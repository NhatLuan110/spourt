'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone recording for the speaking drills.
 *
 * Three things this handles that a naive MediaRecorder call does not:
 *
 *  - The stream's tracks are stopped explicitly on every exit path. Leaving
 *    them running keeps the browser's recording indicator lit after the learner
 *    has finished, which reads as the app still listening.
 *  - The mime type is negotiated rather than assumed. Safari does not produce
 *    webm, and a hardcoded type makes the recorder throw there.
 *  - Duration is measured from the actual start, not from when the request was
 *    made, because permission prompts can take seconds and that time is not
 *    speech.
 */

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'denied' | 'unsupported';

export interface Recording {
  base64: string;
  mimeType: SupportedMime;
  durationMs: number;
  /** For the playback element, revoked when a new recording replaces it. */
  objectUrl: string;
}

/** The formats the API accepts, in the order they are preferred. */
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

export type SupportedMime = 'audio/webm' | 'audio/mp4' | 'audio/ogg' | 'audio/wav';

/** Strips the codec parameter: the API validates the bare type. */
export function baseMime(mimeType: string): SupportedMime {
  const bare = mimeType.split(';')[0]?.trim() ?? '';
  if (bare === 'audio/webm' || bare === 'audio/mp4' || bare === 'audio/ogg' || bare === 'audio/wav') {
    return bare;
  }
  // Anything unexpected is declared as webm, which is what every browser that
  // reaches this point actually produces.
  return 'audio/webm';
}

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

export function useRecorder(maxMs = 30_000) {
  const [state, setState] = useState<RecorderState>('idle');
  const [recording, setRecording] = useState<Recording | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Releasing the microphone on unmount matters: navigating away mid-recording
  // would otherwise leave the browser's indicator on.
  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    const mimeType = pickMimeType();
    if (mimeType === null) {
      setState('unsupported');
      return;
    }

    setState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState('denied');
      return;
    }

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecording(null);
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType });
    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;

      void blob.arrayBuffer().then((buffer) => {
        setRecording({
          base64: toBase64(buffer),
          mimeType: baseMime(mimeType),
          durationMs,
          objectUrl,
        });
        setState('stopped');
      });

      cleanup();
    };

    startedAtRef.current = Date.now();
    setElapsedMs(0);
    recorder.start();
    setState('recording');

    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      // A hard ceiling, because a forgotten recording would otherwise grow
      // until it exceeded the request body limit and failed at submit time.
      if (elapsed >= maxMs) stop();
    }, 100);
  }, [cleanup, maxMs, stop]);

  const reset = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecording(null);
    setElapsedMs(0);
    setState('idle');
  }, []);

  return { state, recording, elapsedMs, start, stop, reset };
}

/**
 * Chunked so a long recording does not blow the argument limit of
 * `String.fromCharCode`, which a single spread over a megabyte would.
 */
export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}
