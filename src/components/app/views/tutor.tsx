'use client';
// AI Tutor chat view + Pronunciation check component
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import {
  Send, Trash2, Mic, Square, Volume2, Bot, User, Sparkles, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { useSpeak } from '@/lib/client';
import { sendUncloseAI } from '@/lib/uncloseai';
import { toHira } from '@/lib/dict/convert';
import { useUi } from '@/lib/stores';
import { BookOpenCheck } from 'lucide-react';

// ==================================================================== AI TUTOR
interface Msg { role: 'user' | 'assistant'; content: string; ts: number; }

const MODES = [
  { id: 'tutor', label: 'Sensei', jp: '先生', desc: 'Corrections + explanations' },
  { id: 'drill', label: 'Drill', jp: 'ドリル', desc: 'One-prompt practice loop' },
  { id: 'chat', label: 'Chat', jp: '雑談', desc: 'Casual Japanese conversation' },
] as const;

const QUICK_PROMPTS: Record<string, string[]> = {
  tutor: ['Explain は vs が', 'Correct: 私は寿司を食べたです', 'Teach me 5 words for a train station', 'How do I politely decline an invitation?'],
  drill: ['Start a JLPT N5 drill', 'Quiz me on past tense', 'Give me a translation challenge', 'Conjugation drill: のむ'],
  chat: ['はじめまして！', 'What did you eat today?', 'Let\'s talk about hobbies', 'Tell me about your favorite season'],
};

export function TutorView() {
  const [mode, setMode] = useState<string>('tutor');
  const [messages, setMessages] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speak = useSpeak();
  const tutorContext = useUi(s => s.tutorContext);
  const setTutorContext = useUi(s => s.setTutorContext);

  // dictionary context injected via "Ask AI" buttons — auto-ask once
  const consumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (tutorContext && consumedRef.current !== tutorContext.prompt + tutorContext.title) {
      consumedRef.current = tutorContext.prompt + tutorContext.title;
      setMode('tutor');
      send(tutorContext.prompt);
    }
  }, [tutorContext]);

  // load persisted conversations
  useEffect(() => {
    try {
      const raw = localStorage.getItem('bunsan-tutor');
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);
  const persist = (next: Record<string, Msg[]>) => {
    setMessages(next);
    try { localStorage.setItem('bunsan-tutor', JSON.stringify(next)); } catch { /* noop */ }
  };

  const thread = messages[mode] || [];

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    // prefix dictionary context so the tutor knows the exact entry
    const ctx = useUi.getState().tutorContext;
    const payload = ctx ? `${content}\n\n[Dictionary context — ${ctx.title}: ${ctx.detail}]` : content;
    if (ctx) setTutorContext(null);
    const userMsg: Msg = { role: 'user', content, ts: Date.now() };
    const next = { ...messages, [mode]: [...thread, userMsg] };
    persist(next);
    setBusy(true);
    try {
      const personas: Record<string, string> = {
        tutor: 'You are Sakura-sensei, the Bunsan Jisho Japanese tutor. Be warm and encouraging. Adapt to the learner level. Correct Japanese mistakes gently and naturally. Teach English speakers with short Japanese examples. Keep replies under 120 words. Use romaji sparingly for beginners.',
        drill: 'You are the Bunsan Jisho Japanese drill master. Give ONE short practice prompt at a time, wait for the learner answer, then grade it and explain briefly before giving the next prompt. Keep each reply under 60 words.',
        chat: 'You are Ren, a friendly Japanese conversation partner inside Bunsan Jisho. Chat casually in easy Japanese with short romaji hints when useful. Naturally rephrase mistakes. Keep replies conversational and under 80 words.',
      };
      const history = [...next[mode].slice(-12).map(m => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.content}`), `Learner: ${payload}`].join('\n');
      const prompt = `${personas[mode] || personas.tutor}\n\nConversation so far:\n${history}\n\nReply to the latest learner message.`;
      const reply = await sendUncloseAI(prompt);
      if (reply) {
        persist({ ...next, [mode]: [...next[mode], { role: 'assistant', content: reply, ts: Date.now() }] });
      } else {
        toast({ title: 'Tutor unavailable', description: 'uncloseai returned an empty response.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error', variant: 'destructive' });
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 120);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto h-[calc(100vh-13rem)] min-h-[520px] flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Tutor <span className="text-muted-foreground font-normal text-lg">先生AI</span></h1>
          <p className="text-sm text-muted-foreground">Chat with an AI Japanese tutor — corrections, drills & conversation</p>
        </div>
        {thread.length > 0 && (
          <Button size="sm" variant="ghost" className="sm:ml-auto text-destructive hover:text-destructive" onClick={() => { persist({ ...messages, [mode]: [] }); toast({ title: 'Conversation cleared' }); }}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}
      </div>

      <ToggleGroup type="single" value={mode} onValueChange={v => v && setMode(v)} className="gap-2">
        {MODES.map(m => (
          <ToggleGroupItem key={m.id} value={m.id} className="gap-2 px-4 h-10 border data-[state=on]:border-primary">
            <span className="font-medium">{m.label}</span>
            <span className="jp-sans text-xs text-muted-foreground">{m.jp}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Card className="flex-1 flex flex-col overflow-hidden"><CardContent className="p-0 flex flex-col h-full">
        <ScrollArea className="flex-1 p-4" ref={undefined}>
          <div ref={scrollRef} className="space-y-3 max-h-full overflow-y-auto bunsan-scroll pr-2" style={{ maxHeight: 'calc(100% - 0px)' }}>
            {thread.length === 0 && (
              <div className="text-center py-10 space-y-3 anim-fade-up">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center"><Bot className="h-7 w-7 text-primary" /></div>
                <p className="font-medium">{MODES.find(m => m.id === mode)?.label} mode — {MODES.find(m => m.id === mode)?.desc}</p>
                <p className="text-xs text-muted-foreground">日本語で話してみましょう！ (Try speaking Japanese!)</p>
                <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                  {(QUICK_PROMPTS[mode] || []).map(p => (
                    <Button key={p} size="sm" variant="secondary" className="h-8 text-xs" onClick={() => send(p)}>{p}</Button>
                  ))}
                </div>
              </div>
            )}
            {thread.map((m, i) => (
              <div key={i} className={`flex gap-2.5 anim-fade-up ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-secondary' : 'bg-primary/15'}`}>
                  {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
                </div>
                <div className={`group relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                  {m.content}
                  {m.role === 'assistant' && /[\u3040-\u30ff]/.test(m.content) && (
                    <button className="absolute -left-9 top-2 opacity-0 group-hover:opacity-100 transition p-1 text-muted-foreground hover:text-primary" onClick={() => speak(m.content.slice(0, 120))} aria-label="play reply">
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-2.5 anim-fade-up">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center"><Bot className="h-4 w-4 text-primary" /></div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">thinking…</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="border-t p-3 space-y-2">
          {tutorContext && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 anim-fade-up">
              <BookOpenCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0 text-xs">
                <span className="font-medium">Attaching dictionary context: </span>
                <span className="jp-sans text-muted-foreground truncate">{tutorContext.title}</span>
              </div>
              <button className="ml-auto text-muted-foreground hover:text-destructive text-xs shrink-0" onClick={() => setTutorContext(null)} aria-label="remove context">✕</button>
            </div>
          )}
          {thread.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {(QUICK_PROMPTS[mode] || []).slice(0, 3).map(p => (
                <button key={p} className="text-[11px] rounded-full border px-2.5 py-1 text-muted-foreground hover:border-primary/50 hover:text-foreground transition" onClick={() => send(p)}>{p}</button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={mode === 'chat' ? '日本語で書いてみて… (write in Japanese…)' : 'Ask anything, or write Japanese to check…'}
              className="min-h-11 max-h-32 resize-none text-sm"
              aria-label="tutor message"
            />
            <Button size="icon" className="h-11 w-11 shrink-0" onClick={() => send()} disabled={busy || !input.trim()} aria-label="send message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent></Card>
    </div>
  );
}

// ==================================================================== PRONUNCIATION CHECK
function normalizeKana(s: string): string {
  return toHira(s).replace(/[。、．，！？\s「」『』・ー]/g, '').replace(/ゅ/g, 'ュ').replace(/ょ/g, 'ョ').replace(/ゃ/g, 'ャ');
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // char-level LCS ratio
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return (2 * dp[m][n]) / (m + n);
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function PronunciationCheck({ expected, label }: { expected: string; label?: string }) {
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ text: string; score: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    recognitionRef.current?.stop();
  }, []);

  const start = () => {
    setResult(null);
    setError('');
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Speech recognition is not available in this browser. Try Chrome or another browser that supports the Web Speech API.');
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = 'ja-JP';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = event => {
        const heard = Array.from(event.results)
          .map(result => result[0]?.transcript || '')
          .join('')
          .trim();
        const score = similarity(normalizeKana(heard), normalizeKana(expected));
        setResult({ text: heard, score });
      };
      recognition.onerror = () => {
        setError('Speech recognition failed — check microphone permission and try again.');
        setRecording(false);
        setBusy(false);
      };
      recognition.onend = () => {
        setRecording(false);
        setBusy(false);
      };

      recognitionRef.current = recognition;
      setBusy(true);
      setRecording(true);
      recognition.start();
      timerRef.current = window.setTimeout(() => {
        try { recognition.stop(); } catch { /* noop */ }
      }, 4000);
    } catch {
      setError('Could not start speech recognition.');
      setRecording(false);
      setBusy(false);
    }
  };

  const stop = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    setRecording(false);
  };

  const score = result?.score ?? 0;
  const verdict = score >= 0.75 ? { cls: 'text-emerald-600', icon: <CheckCircle2 className="h-4 w-4" />, msg: 'Excellent pronunciation!' } : score >= 0.45 ? { cls: 'text-amber-600', icon: <Sparkles className="h-4 w-4" />, msg: 'Close — keep practicing.' } : { cls: 'text-red-500', icon: <XCircle className="h-4 w-4" />, msg: 'Try again, slower and clearer.' };

  return (
    <div className="rounded-xl border p-4 space-y-3 bg-card anim-fade-up">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5"><Mic className="h-4 w-4 text-primary" />Pronunciation check {label ? <span className="font-normal text-muted-foreground">— {label}</span> : null}</div>
      </div>
      <p className="text-xs text-muted-foreground">Say: <span className="jp-sans font-medium text-foreground">{expected}</span> (max 4s)</p>
      <div className="flex items-center gap-2">
        {!recording ? (
          <Button size="sm" onClick={start} disabled={busy} className="gap-1.5"><Mic className="h-3.5 w-3.5" />Record</Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={stop} className="gap-1.5 animate-pulse"><Square className="h-3.5 w-3.5" />Stop & check</Button>
        )}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {result && (
          <Badge variant="secondary" className={`${verdict.cls} gap-1 bg-transparent border`}>
            {verdict.icon}{Math.round(score * 100)}%
          </Badge>
        )}
      </div>
      {result && (
        <div className="text-sm space-y-1 anim-fade-up">
          <div className={verdict.cls + ' flex items-center gap-1.5 font-medium'}>{verdict.icon}{verdict.msg}</div>
          <div className="text-xs text-muted-foreground">Heard: <span className="jp-sans text-foreground">{result.text || '(nothing)'}</span> · Expected: <span className="jp-sans text-foreground">{expected}</span></div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">Speech is recognized in your browser; no Bunsan Jisho server is required.</p>
    </div>
  );
}
