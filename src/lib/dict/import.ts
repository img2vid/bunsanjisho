// CSV / Anki-export deck parsing + dictionary matching for bulk import
import { WORDS } from './index';
import { toHira } from './convert';

export interface CsvRow {
  word: string;
  reading: string;
  meaning: string;
}

export interface ParsedRow extends CsvRow {
  /** matched dictionary word id, or null */
  matchId: number | null;
  /** how the match was made */
  via: 'form' | 'reading' | 'gloss' | 'none';
}

/** Parse pasted CSV/TSV content. Accepts 1-3 columns: word[,reading[,meaning]]. Handles quotes, #Comment lines, Anki headers. */
export function parseDeckCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || /^separator/i.test(line)) continue;
    // detect delimiter: tab wins, else comma, else semicolon
    const delim = line.includes('\t') ? '\t' : line.includes(',') ? ',' : ';';
    const cols = splitCsvLine(line, delim).map(c => c.trim()).filter(c => c !== '');
    if (cols.length === 0) continue;
    // Anki "front;back" or "word,reading,meaning"
    const word = cols[0];
    const reading = cols[1] && /[\u3040-\u30ff]/.test(cols[1]) ? cols[1] : '';
    const meaning = cols.find((c, i) => i > 0 && c !== reading) || cols[1] || '';
    if (word) rows.push({ word, reading, meaning });
  }
  return rows;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// lazy indexes for matching
let byForm: Map<string, number[]> | null = null;
let byReading: Map<string, number[]> | null = null;

function buildIndexes() {
  if (byForm) return;
  byForm = new Map();
  byReading = new Map();
  for (const w of WORDS) {
    const forms = [w.k, ...(w.alt || [])].filter(Boolean);
    for (const f of forms) {
      const arr = byForm.get(f) || [];
      arr.push(w.id);
      byForm.set(f, arr);
    }
    for (const r of w.a) {
      const arr = byReading.get(r) || [];
      arr.push(w.id);
      byReading.set(r, arr);
    }
  }
}

/** Match a CSV row to a dictionary entry. */
export function matchCsvRow(row: CsvRow): ParsedRow {
  buildIndexes();
  const w = row.word.trim();
  // 1. exact written form
  const f = byForm!.get(w);
  if (f && f.length) return { ...row, matchId: f[0], via: 'form' };
  // 2. reading match (normalize katakana→hiragana)
  const rdSrc = row.reading || w;
  const rd = toHira(rdSrc);
  const r = byReading!.get(rd);
  if (r && r.length) {
    // prefer a word whose form matches if user gave kanji+reading
    return { ...row, matchId: r[0], via: 'reading' };
  }
  // 3. gloss keyword match (first word > 3 chars)
  const kw = row.meaning.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).find(x => x.length > 3);
  if (kw) {
    const hits = WORDS.find(x => x.s.some(s => s.gloss.toLowerCase().includes(kw)) && (!x.f || x.f < 8000));
    if (hits) return { ...row, matchId: hits.id, via: 'gloss' };
  }
  return { ...row, matchId: null, via: 'none' };
}

export function matchCsvRows(rows: CsvRow[]): ParsedRow[] {
  return rows.map(matchCsvRow);
}
