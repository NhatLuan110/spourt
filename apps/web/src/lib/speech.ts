/**
 * §12.1 wants a recorded US and UK pronunciation for every word. Until a TTS
 * provider is configured the seeded words have no audio file, so the browser's
 * own speech synthesis stands in: it is offline, free, and present in every
 * target browser. A real recording always wins when the word has one.
 */
import { mediaUrl } from './asset-url';

export type Accent = 'us' | 'uk';

const VOICE_LANG: Record<Accent, string> = { us: 'en-US', uk: 'en-GB' };

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(accent: Accent): SpeechSynthesisVoice | undefined {
  const wanted = VOICE_LANG[accent];
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === wanted) ??
    voices.find((voice) => voice.lang.replace('_', '-').startsWith(wanted.slice(0, 2)))
  );
}

/**
 * Speak one word or sentence. Returns false when the browser cannot.
 *
 * The onEnd callback fires when the utterance finishes or fails, which is how the
 * listening player advances through a transcript without a real audio file to
 * take timings from (D-033). It is called at most once.
 */
export function speak(
  text: string,
  accent: Accent = 'us',
  rate = 1,
  onEnd?: () => void,
): boolean {
  if (!speechSupported() || text.trim() === '') {
    onEnd?.();
    return false;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = VOICE_LANG[accent];
  utterance.rate = rate;
  const voice = pickVoice(accent);
  if (voice) utterance.voice = voice;

  if (onEnd) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onEnd();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * Play a recorded file when there is one, otherwise fall back to synthesis.
 * Resolves to what actually happened so the UI can stay honest about it.
 */
export async function playWord(params: {
  url: string | null;
  text: string;
  accent?: Accent;
  rate?: number;
}): Promise<'file' | 'synthesis' | 'unavailable'> {
  const accent = params.accent ?? 'us';

  if (params.url) {
    try {
      const audio = new Audio(mediaUrl(params.url));
      audio.playbackRate = params.rate ?? 1;
      await audio.play();
      return 'file';
    } catch {
      // A missing or blocked file falls through to synthesis rather than
      // leaving the learner with a silent button.
    }
  }

  return speak(params.text, accent, params.rate ?? 1) ? 'synthesis' : 'unavailable';
}
