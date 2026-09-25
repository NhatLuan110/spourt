/**
 * Đọc và nghe tiếng Trung ngay trong trình duyệt.
 *
 * Tách khỏi `lib/speech.ts` của ngăn tiếng Anh: tệp đó chỉ biết giọng us/uk và
 * gắn với cài đặt `ttsAccent` của người học, còn ở đây cần giọng zh-CN cùng bộ
 * nhận dạng lời nói để chấm phát âm. Không thêm phụ thuộc nào — cả hai đều là
 * API sẵn có của trình duyệt.
 */

const ZH = 'zh-CN';

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Trình duyệt nạp danh sách giọng bất đồng bộ, lần gọi đầu thường trả mảng rỗng.
 * Giữ lại kết quả để các lần sau khỏi dò lại.
 */
let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  if (!ttsSupported()) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  cachedVoice =
    voices.find((voice) => voice.lang === ZH) ??
    voices.find((voice) => voice.lang.replace('_', '-').startsWith('zh-CN')) ??
    voices.find((voice) => voice.lang.replace('_', '-').startsWith('zh')) ??
    null;
  return cachedVoice;
}

export interface SpeakOptions {
  /** 1 là tốc độ thường. Người mới nên nghe 0.7 trước. */
  rate?: number;
  onEnd?: () => void;
}

/** Đọc một chuỗi chữ Hán bằng giọng tiếng Trung. */
export function speakChinese(text: string, options: SpeakOptions = {}): boolean {
  if (!ttsSupported()) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = ZH;
  utterance.rate = options.rate ?? 0.85;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  if (options.onEnd) utterance.addEventListener('end', options.onEnd);
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/** Máy có giọng tiếng Trung nào chưa; chưa có thì phần nghe sẽ báo cho người dùng. */
export function hasChineseVoice(): boolean {
  return pickVoice() !== null;
}

// ---------------------------------------------------------------------------
// Nhận dạng lời nói để chấm phát âm
// ---------------------------------------------------------------------------

interface RecognitionResultLike {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
  length: number;
}

interface RecognitionEventLike {
  results: { length: number; [index: number]: RecognitionResultLike };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const holder = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null;
}

export function recognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

export interface PronunciationResult {
  /** Chuỗi máy nghe được. */
  heard: string;
  /** 0..100, so khớp với chuỗi đích. */
  score: number;
  /** Từng chữ trong câu đích: đọc đúng hay chưa. */
  perCharacter: { character: string; correct: boolean }[];
}

/**
 * Ghi âm một lượt rồi trả về chuỗi máy nghe được. Trình duyệt trả về chữ Hán,
 * nên chấm bằng cách so từng chữ với câu đích chứ không so pinyin — người học
 * đọc sai thanh thì máy nghe ra chữ khác, và đó chính là lỗi cần bắt.
 */
export function listenOnce(timeoutMs = 8000): Promise<string> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.reject(new Error('Trình duyệt không hỗ trợ nhận dạng giọng nói.'));

  return new Promise((resolve, reject) => {
    const recognition = new Ctor();
    recognition.lang = ZH;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        recognition.abort();
      } catch {
        // Đã tự dừng rồi thì thôi.
      }
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error('Không nghe thấy gì. Thử nói to và rõ hơn.'))),
      timeoutMs,
    );

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      finish(() => resolve(transcript));
    };
    recognition.onerror = (event) => {
      const message =
        event.error === 'not-allowed'
          ? 'Trình duyệt chưa được cấp quyền dùng micro.'
          : event.error === 'no-speech'
            ? 'Không nghe thấy gì. Thử nói to và rõ hơn.'
            : `Lỗi nhận dạng: ${event.error}`;
      finish(() => reject(new Error(message)));
    };
    recognition.onend = () => {
      finish(() => reject(new Error('Chưa ghi được lời nói nào.')));
    };

    recognition.start();
  });
}

const PUNCTUATION = /[\s，。！？、,.!?；;：:'"“”‘’（）()]/g;

/** So chuỗi nghe được với câu đích, chấm điểm theo từng chữ. */
export function scorePronunciation(target: string, heard: string): PronunciationResult {
  const cleanTarget = target.replace(PUNCTUATION, '');
  const cleanHeard = heard.replace(PUNCTUATION, '');

  // Mỗi chữ đích tìm một chữ khớp trong chuỗi nghe được, theo đúng thứ tự, để
  // người đọc thiếu hoặc thừa một chữ vẫn được tính đúng phần còn lại.
  let cursor = 0;
  const perCharacter = [...cleanTarget].map((character) => {
    const found = cleanHeard.indexOf(character, cursor);
    if (found >= 0) {
      cursor = found + 1;
      return { character, correct: true };
    }
    return { character, correct: false };
  });

  const correct = perCharacter.filter((item) => item.correct).length;
  const score = perCharacter.length === 0 ? 0 : Math.round((correct / perCharacter.length) * 100);
  return { heard, score, perCharacter };
}
