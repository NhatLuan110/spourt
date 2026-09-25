'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ExamAudio({ transcript, accent = 'uk', rate = 1 }: { transcript: { speaker: string; text: string }[]; accent?: 'us' | 'uk'; rate?: number }) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => () => { generation.current++; if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  function stop() { generation.current++; setPlaying(false); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
  function play() {
    if (!('speechSynthesis' in window)) { setError('Trình duyệt chưa hỗ trợ giọng đọc. Mở bài bằng Chrome hoặc Edge để nghe.'); return; }
    stop(); setError(''); setPosition(0); setPlaying(true);
    const current = ++generation.current;
    // Short utterances avoid the long-text cutoff in browser speech engines.
    const queue = transcript.flatMap((turn, turnIndex) => (turn.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [turn.text]).flatMap(sentence => {
      const chunks: string[] = []; let chunk = '';
      for (const word of sentence.trim().split(/\s+/)) { if ((chunk + word).length > 220 && chunk) { chunks.push(chunk); chunk = ''; } chunk += `${word} `; }
      if (chunk.trim()) chunks.push(chunk.trim());
      return chunks.map(text => ({ text, turnIndex }));
    }));
    let index = 0;
    const next = () => {
      if (current !== generation.current) return;
      const item = queue[index++];
      if (!item) { setPlaying(false); utteranceRef.current = null; return; }
      setPosition(item.turnIndex + 1);
      const utterance = new SpeechSynthesisUtterance(item.text);
      utteranceRef.current = utterance;
      utterance.lang = accent === 'us' ? 'en-US' : 'en-GB';
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang === utterance.lang) ?? voices.find(v => v.lang.startsWith('en'));
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      utterance.onend = next;
      utterance.onerror = event => {
        if (current !== generation.current) return;
        setPlaying(false);
        setError(`Chưa phát được giọng đọc (${event.error}). Kiểm tra âm thanh của máy rồi thử lại.`);
      };
      window.speechSynthesis.speak(utterance);
    };
    next();
  }
  return <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-alt)] p-4">
    <div className="flex flex-wrap items-center gap-3"><Button onClick={playing ? stop : play}>{playing ? 'Dừng bài nghe' : 'Phát từ đầu'}</Button>{playing ? <span className="text-sm">Đang phát đoạn {position}/{transcript.length}</span> : null}</div>
    <p className="text-sm text-[var(--text-muted)]">Giọng đọc tổng hợp tiếng Anh trên thiết bị · tốc độ {rate.toFixed(2)}×. Bản chép lời mở sau khi nộp bài.</p>
    {error ? <p role="alert" className="text-sm text-[var(--warning)]">{error}</p> : null}
  </div>;
}
