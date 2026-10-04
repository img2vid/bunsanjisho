'use client';
// Printable kanji practice sheets (genkō yōshi 原稿用紙) — trace-first grid, print-ready
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { kanjiByChar } from '@/lib/dict/index';
import { toHira } from '@/lib/dict/convert';
import { Printer, Grid3x3 } from 'lucide-react';

interface PracticeSheetDialogProps {
  kanjiList: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const KANJI_PER_ROW_OPTIONS = [2, 4, 6, 8];

export function PracticeSheetDialog({ kanjiList, open, onOpenChange }: PracticeSheetDialogProps) {
  const [perRow, setPerRow] = useState(4);
  const [repeats, setRepeats] = useState(4); // empty cells per kanji
  const [withHints, setWithHints] = useState(true);
  const [withTrace, setWithTrace] = useState(true);
  const chars = useMemo(() => kanjiList.filter(c => kanjiByChar.has(c)).slice(0, 40), [kanjiList]);

  const print = () => {
    document.body.classList.add('printing-sheet');
    const cleanup = () => { document.body.classList.remove('printing-sheet'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Safari fallback: afterprint may not fire if the dialog is cancelled quickly
    setTimeout(cleanup, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Grid3x3 className="h-4 w-4 text-primary" />Kanji practice sheet
            <span className="jp-sans text-xs text-muted-foreground font-normal">漢字練習帳</span>
          </DialogTitle>
          <DialogDescription>
            Printable genkō yōshi grid — one traceable model cell, then empty squares to write from memory. {chars.length} kanji selected.
          </DialogDescription>
        </DialogHeader>

        {/* options */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border bg-accent/30 p-3.5">
          <div className="space-y-1.5">
            <Label className="text-xs">Squares per row</Label>
            <div className="flex gap-1">
              {KANJI_PER_ROW_OPTIONS.map(n => (
                <button key={n} onClick={() => setPerRow(n)}
                  className={`h-8 w-9 rounded-md border text-xs font-medium transition ${perRow === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/50'}`}
                  aria-pressed={perRow === n}>{n}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex justify-between gap-3"><span>Practice squares</span><span className="tabular-nums text-muted-foreground">{repeats}</span></Label>
            <input type="range" min={2} max={8} value={repeats} onChange={e => setRepeats(Number(e.target.value))} className="w-32 accent-[hsl(var(--primary))]" aria-label="practice squares per kanji" />
          </div>
          <div className="flex items-center gap-2 pb-1"><Switch id="ps-hints" checked={withHints} onCheckedChange={setWithHints} /><Label htmlFor="ps-hints" className="text-xs">Reading & meaning footer</Label></div>
          <div className="flex items-center gap-2 pb-1"><Switch id="ps-trace" checked={withTrace} onCheckedChange={setWithTrace} /><Label htmlFor="ps-trace" className="text-xs">Faded model character</Label></div>
          <Button size="sm" className="ml-auto gap-1.5" onClick={print} disabled={chars.length === 0}>
            <Printer className="h-3.5 w-3.5" />Print sheet
          </Button>
        </div>

        {/* live preview (also the printed area) */}
        {open && (
          <div className="rounded-xl border p-4 max-h-[46vh] overflow-y-auto bunsan-scroll bg-white" aria-label="practice sheet preview">
            <PrintSheet chars={chars} perRow={perRow} repeats={repeats} withHints={withHints} withTrace={withTrace} />
          </div>
        )}
      </DialogContent>
      {/* hidden print-only copy of the sheet (mounts only while the dialog is open) */}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="print-sheet-portal">
          <PrintSheet chars={chars} perRow={perRow} repeats={repeats} withHints={withHints} withTrace={withTrace} />
        </div>,
        document.body
      )}
    </Dialog>
  );
}

/** The sheet itself — rendered inside .print-sheet-portal when printing */
export function PrintSheet({ chars, perRow, repeats, withHints, withTrace }: {
  chars: string[]; perRow: number; repeats: number; withHints: boolean; withTrace: boolean;
}) {
  const rows = useMemo(() => {
    const out: Array<Array<{ ch: string; trace: boolean }>> = [];
    for (const ch of chars) {
      const cells: Array<{ ch: string; trace: boolean }> = [];
      if (withTrace) cells.push({ ch, trace: true });
      for (let i = 0; i < repeats; i++) cells.push({ ch, trace: false });
      // chunk the row into groups of perRow
      for (let i = 0; i < cells.length; i += perRow) out.push(cells.slice(i, i + perRow));
    }
    return out;
  }, [chars, perRow, repeats, withTrace]);

  if (chars.length === 0) {
    return <p className="text-sm text-muted-foreground p-4 text-center">No kanji to include.</p>;
  }

  const cellSize = perRow <= 2 ? 'h-24' : perRow === 4 ? 'h-20' : perRow === 6 ? 'h-16' : 'h-14';

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between border-b pb-2">
        <div>
          <div className="text-base font-semibold">Bunsan Jisho — 漢字練習帳</div>
          <div className="text-[10px] text-muted-foreground">Kanji writing practice · trace the grey model, fill the rest from memory</div>
        </div>
        <div className="text-[10px] text-muted-foreground text-right">
          Name: ______________<br />Date: {new Date().toLocaleDateString()}
        </div>
      </div>
      {chars.map(ch => {
        const info = kanjiByChar.get(ch);
        const reading = info?.kun[0] || info?.on[0] || '';
        const readingHira = reading ? toHira(reading.replace(/[-.]/g, '')) : '';
        return (
          <div key={ch} className="space-y-1.5">
            {rows.filter(r => r[0]?.ch === ch).map((row, ri) => (
              <div key={ri} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
                {row.map((cell, ci) => (
                  <div key={ci} className={`genko-cell genkoshi ${cellSize}`}>
                    {cell.trace && <span className={`trace-kanji select-none ${perRow >= 6 ? 'text-3xl' : perRow >= 4 ? 'text-4xl' : 'text-6xl'}`}>{ch}</span>}
                  </div>
                ))}
              </div>
            ))}
            {withHints && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-0.5">
                <span className="jp-serif text-base text-foreground/80">{ch}</span>
                <span className="jp-sans">{readingHira || '—'}</span>
                <span className="truncate">{info?.m.slice(0, 2).join(', ')}</span>
                {info && <span className="ml-auto shrink-0">{info.st} strokes</span>}
              </div>
            )}
          </div>
        );
      })}
      <div className="border-t pt-2 text-center text-[9px] text-muted-foreground">
        Generated with Bunsan Jisho 分散辞書 · kanji data © EDRDG (KANJIDIC2)
      </div>
    </div>
  );
}

