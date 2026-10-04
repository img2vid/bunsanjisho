'use client';
// Animated kanji stroke-order player — draws KanjiVG paths stroke-by-stroke
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { loadStrokes } from '@/lib/dict/strokes';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Hash, Layers, Palette } from 'lucide-react';

const DRAW_MS_PER_LEN = 0.28; // ms per path-length unit at 1× speed
const PAUSE_BETWEEN = 140;
/** Rainbow chunking palette (cycled per stroke) for the color-mode toggle */
const STROKE_PALETTE = ['#e46a8b', '#d05a4e', '#b8860b', '#3f8f6b', '#2a9d8f', '#7d5ba6'];

export function StrokeOrderAnim({ ch, size = 220, compact = false }: { ch: string; size?: number; compact?: boolean }) {
  const [data, setData] = useState<{ ch: string; paths: string[] } | null>(null);
  const [lens, setLens] = useState<number[]>([]);
  const [progress, setProgress] = useState(0); // float: strokes drawn (2.4 = stroke 3 is 40% drawn)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showNumbers, setShowNumbers] = useState(!compact);
  const [showGhost, setShowGhost] = useState(true);
  const [colorMode, setColorMode] = useState(false);
  const [mids, setMids] = useState<Array<{ x: number; y: number }>>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const raf = useRef<number | null>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    let alive = true;
    loadStrokes(ch).then(p => {
      if (!alive) return;
      progressRef.current = 0;
      setPlaying(false);
      setData(p && p.length ? { ch, paths: p } : { ch, paths: [] });
    });
    return () => { alive = false; };
  }, [ch]);

  const active = data?.ch === ch ? data : null;
  const paths = active ? active.paths : null;
  const failed = !!active && active.paths.length === 0;

  // measure path lengths + midpoint of each stroke (for number badges)
  useEffect(() => {
    if (!paths || paths.length === 0) return;
    const ls = pathRefs.current.map(el => (el ? el.getTotalLength() : 0));
    setLens(ls);
    setMids(pathRefs.current.map(el => (el ? el.getPointAtLength(el.getTotalLength() * 0.5) : { x: 0, y: 0 })));
    setProgress(0);
    if (compact) setPlaying(true);
  }, [data, compact]);

  // keep ref in sync for the rAF loop
  useEffect(() => { progressRef.current = progress; }, [progress]);

  // animation loop
  useEffect(() => {
    if (!playing || lens.length === 0) return;
    let last = performance.now();
    let wait = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const cur = progressRef.current;
      if (cur >= lens.length) { setPlaying(false); return; }
      if (wait > 0) { wait -= dt; }
      else {
        const idx = Math.max(0, Math.floor(cur));
        const len = lens[idx] || 1;
        const step = dt / (len * DRAW_MS_PER_LEN) / speed;
        progressRef.current = cur + step;
        setProgress(progressRef.current);
        if (progressRef.current >= idx + 1) wait = PAUSE_BETWEEN / speed;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, lens, speed]);

  const play = useCallback(() => {
    if (progressRef.current >= lens.length) { progressRef.current = 0; setProgress(0); }
    setPlaying(true);
  }, [lens.length]);

  const stepTo = useCallback((n: number) => {
    setPlaying(false);
    progressRef.current = n;
    setProgress(n);
  }, []);

  if (failed) return null;
  if (!paths) {
    return <div className="rounded-xl border bg-card animate-pulse flex items-center justify-center text-muted-foreground text-xs" style={{ width: size, height: size }}>loading strokes…</div>;
  }
  const done = progress >= lens.length;
  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div
        className="relative rounded-xl overflow-hidden border border-primary/15 shadow-inner"
        style={{
          width: size, height: size,
          background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--primary) / 0.05) 100%)',
        }}
        role="img"
        aria-label={`stroke order animation for ${ch}, ${paths.length} strokes`}
      >
        {/* practice grid */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 109 109" aria-hidden>
          <line x1="54.5" y1="0" x2="54.5" y2="109" stroke="currentColor" strokeWidth="0.4" className="text-primary/15" />
          <line x1="0" y1="54.5" x2="109" y2="54.5" stroke="currentColor" strokeWidth="0.4" className="text-primary/15" />
          <line x1="0" y1="0" x2="109" y2="109" stroke="currentColor" strokeWidth="0.25" className="text-primary/10" strokeDasharray="2 3" />
          <line x1="109" y1="0" x2="0" y2="109" stroke="currentColor" strokeWidth="0.25" className="text-primary/10" strokeDasharray="2 3" />
        </svg>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 109 109" aria-hidden>
          {/* ghost full kanji */}
          {showGhost && lens.length > 0 && paths.map((d, i) => (
            <path key={`g${i}`} d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/10" />
          ))}
          {/* drawn strokes */}
          {paths.map((d, i) => {
            const len = lens[i] || 1;
            const f = Math.max(0, Math.min(1, progress - i));
            const colored = colorMode && f > 0;
            return (
              <path
                key={i}
                ref={el => { pathRefs.current[i] = el; }}
                d={d}
                fill="none"
                stroke={colored ? STROKE_PALETTE[i % STROKE_PALETTE.length] : 'currentColor'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={colored ? '' : f >= 1 ? 'text-foreground' : 'text-foreground/80'}
                style={{ strokeDasharray: len, strokeDashoffset: len * (1 - f), opacity: colored && f < 1 ? 0.45 + 0.55 * f : 1 }}
              />
            );
          })}
          {/* stroke numbers */}
          {showNumbers && mids.map((pt, i) => {
            if (progress < i + 1) return null;
            return (
              <g key={`n${i}`}>
                <circle cx={pt.x} cy={pt.y} r="4.6" className="fill-background" stroke="currentColor" strokeWidth="0.7" style={{ color: 'hsl(var(--primary))' }} />
                <text x={pt.x} y={pt.y + 2.1} textAnchor="middle" fontSize="6" fontWeight="700" style={{ fill: 'hsl(var(--primary))' }}>{i + 1}</text>
              </g>
            );
          })}
        </svg>
        {done && <div className="absolute top-1.5 right-2 text-[10px] font-medium text-primary bg-background/80 rounded-full px-1.5">{paths.length} strokes</div>}
      </div>
      {!compact && (
        <div className="flex items-center gap-1 flex-wrap justify-center">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => stepTo(Math.max(0, Math.floor(progress) - 1))} aria-label="previous stroke"><SkipBack className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => (playing ? setPlaying(false) : play())} aria-label={playing ? 'pause' : 'play'}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => stepTo(Math.min(lens.length, Math.floor(progress) + 1))} aria-label="next stroke"><SkipForward className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { stepTo(0); setTimeout(play, 60); }} aria-label="replay"><RotateCcw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant={showNumbers ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setShowNumbers(v => !v)} aria-label="toggle stroke numbers"><Hash className="h-3 w-3" /></Button>
          <Button size="sm" variant={showGhost ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setShowGhost(v => !v)} aria-label="toggle ghost"><Layers className="h-3 w-3" /></Button>
          <Button size="sm" variant={colorMode ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setColorMode(v => !v)} aria-label="toggle stroke colors"><Palette className="h-3 w-3" /></Button>
          <select
            className="h-7 rounded-md border bg-background text-xs px-1"
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            aria-label="playback speed"
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </div>
      )}
    </div>
  );
}
