// Kana / Romaji conversion engine
const HIRA_START = 0x3041, HIRA_END = 0x3096;
const KATA_START = 0x30a1, KATA_END = 0x30f6;

export function isHira(s: string) { return /^[\u3041-\u3096ー]+$/.test(s); }
export function isKata(s: string) { return /^[\u30a1-\u30f6ー]+$/.test(s); }
export function hasKanji(s: string) { return /[\u4e00-\u9faf]/.test(s); }
export function hasJapanese(s: string) { return /[\u3040-\u30ff\u4e00-\u9faf]/.test(s); }

export function toKata(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
}
export function toHira(s: string): string {
  return s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// ---------- Romaji -> Hiragana (for search) ----------
const ROM_MAP: Array<[string, string]> = [
  ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'], ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'], ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'], ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'], ['che', 'ちぇ'],
  ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'], ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
  ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'], ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
  ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'], ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'], ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
  ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'], ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
  ['dya', 'じゃ'], ['dyu', 'じゅ'], ['dyo', 'じょ'],
  ['kka', 'っか'], ['kki', 'っき'], ['kku', 'っく'], ['kke', 'っけ'], ['kko', 'っこ'],
  ['ssa', 'っさ'], ['ssi', 'っし'], ['ssu', 'っす'], ['sse', 'っせ'], ['sso', 'っそ'],
  ['tta', 'った'], ['tti', 'っち'], ['ttsu', 'っつ'], ['tte', 'って'], ['tto', 'っと'],
  ['ppa', 'っぱ'], ['ppi', 'っぴ'], ['ppu', 'っぷ'], ['ppe', 'っぺ'], ['ppo', 'っぽ'],
  ['bba', 'っば'], ['bbi', 'っび'], ['bbu', 'っぶ'], ['bbe', 'っべ'], ['bbo', 'っぼ'],
  ['ffa', 'っふ'], ['ffi', 'っぴ'], ['ffu', 'っぷ'], ['ffe', 'っぷぇ'], ['ffo', 'っぷぉ'],
  ['dja', 'っぢゃ'], ['gga', 'っが'], ['ggi', 'っぎ'], ['ggu', 'っぐ'], ['gge', 'っげ'], ['ggo', 'っご'],
  ['zza', 'っざ'], ['zzi', 'っじ'], ['zzu', 'っず'], ['zze', 'っぜ'], ['zzo', 'っぞ'],
  ['shi', 'し'], ['chi', 'ち'], ['tsu', 'つ'], ['tsa', 'つぁ'], ['tso', 'つぉ'],
  ['fu', 'ふ'], ['fa', 'ふぁ'], ['fi', 'ふぃ'], ['fe', 'ふぇ'], ['fo', 'ふぉ'],
  ['ji', 'じ'], ['ti', 'て'], ['tu', 'と'], ['di', 'ぢ'], ['du', 'づ'],
  ['shya', 'しゃ'], ['kkya', 'っきゃ'],
  ['nn', 'ん'], ["n'", 'ん'],
  ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'],
  ['sa', 'さ'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
  ['ta', 'た'], ['te', 'て'], ['to', 'と'],
  ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'],
  ['ha', 'は'], ['hi', 'ひ'], ['he', 'へ'], ['ho', 'ほ'],
  ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'],
  ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
  ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'],
  ['wa', 'わ'], ['wi', 'うぃ'], ['we', 'うぇ'], ['wo', 'を'],
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'],
  ['za', 'ざ'], ['zi', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['da', 'だ'], ['de', 'で'], ['do', 'ど'],
  ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'],
  ['xa', 'ぁ'], ['xi', 'ぃ'], ['xu', 'ぅ'], ['xe', 'ぇ'], ['xo', 'ぉ'], ['xtu', 'っ'], ['xya', 'ゃ'], ['xyu', 'ゅ'], ['xyo', 'ょ'],
  ['ka', 'か'], ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'], ['n', 'ん'],
];

export function romajiToHira(input: string): string {
  let s = input.toLowerCase().replace(/[^a-z']/g, '');
  let out = '';
  let i = 0;
  outer: while (i < s.length) {
    if (s[i] === "'") { i++; continue; }
    // long vowel: 'ou' -> おお is ambiguous; treat 'oo'/'ou'/'uu'/'ei' as-is (skip)
    const two = s.slice(i, i + 2);
    if (['aa', 'ii', 'uu', 'ee', 'oo', 'ou', 'ei'].includes(two)) {
      const base = ROM_MAP.find(([r]) => r === s[i]);
      out += base ? base[1] : '';
      i += 2; // drop the vowel that lengthens (approximation for search)
      continue;
    }
    for (const [rom, hira] of ROM_MAP) {
      if (s.startsWith(rom, i)) { out += hira; i += rom.length; continue outer; }
    }
    i++;
  }
  return out;
}

// ---------- Hiragana -> Romaji ----------
const HIRA_ROM: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'wo',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ん: 'n',
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', っ: '',
};
const SMALL_YO = ['ゃ', 'ゅ', 'ょ'];

export function hiraToRomaji(hira: string): string {
  let out = '';
  let i = 0;
  const s = toHira(hira);
  while (i < s.length) {
    const three = s.slice(i, i + 3);
    const two = s.slice(i, i + 2);
    if (HIRA_ROM[three]) { out += HIRA_ROM[three]; i += 3; continue; }
    if (two.length === 2 && SMALL_YO.includes(two[1]) && HIRA_ROM[two]) { out += HIRA_ROM[two]; i += 2; continue; }
    const c = s[i];
    if (c === 'っ') {
      const next = s[i + 1];
      const nextRom = next && HIRA_ROM[s.slice(i + 1, i + 3)] ? HIRA_ROM[s.slice(i + 1, i + 3)][0] : next ? (HIRA_ROM[next]?.[0] ?? '') : '';
      out += nextRom && !'aiueon'.includes(nextRom) ? nextRom : nextRom;
      i++; continue;
    }
    out += HIRA_ROM[c] ?? c;
    i++;
  }
  return out;
}

// ---------- Kana helpers ----------
export function stripOkurigana(kunReading: string): string {
  // た-べる -> たべる, あさ-. -> あさ
  return kunReading.replace(/[-.]/g, '');
}

// ---------- Kunrei-shiki -> Hepburn (romaji search tolerance) ----------
const KUNREI_MAP: Array<[RegExp, string]> = [
  [/ssi/g, 'shi'], [/sya/g, 'sha'], [/syu/g, 'shu'], [/syo/g, 'sho'],
  [/ti([aeiou])/g, 'chi$1'], [/tya/g, 'cha'], [/tyu/g, 'chu'], [/tyo/g, 'cho'],
  [/tu/g, 'tsu'], [/hu/g, 'fu'], [/si([bcdfghjklmnpqrstvwxyz]|$)/g, 'shi$1'],
  [/zi/g, 'ji'], [/di([aeiou])/g, 'ji$1'], [/du([aeiou])/g, 'zu$1'],
  [/zu([aeiou])/g, 'zu$1'],
];

/** Convert kunrei-shiki romaji (si, ti, tu, hu…) to the Hepburn spelling used in our data (shi, chi, tsu, fu…). Purely best-effort for search; both spellings are always matched. */
export function kunreiToHepburn(s: string): string {
  if (!/^[a-z\s'-]*$/.test(s)) return s;
  let out = s;
  for (const [re, rep] of KUNREI_MAP) out = out.replace(re, rep);
  return out;
}


/** Split a kanji-form word + kana reading into furigana segments */
export function splitFurigana(kanjiForm: string, kana: string): Array<{ base: string; ruby: string } | { base: string }> {
  if (!kanjiForm || !hasKanji(kanjiForm)) return [{ base: kana || kanjiForm }];
  const kanjiChars = [...kanjiForm];
  // strip trailing okurigana from kana matching last chars of kanjiForm (if kanjiForm has trailing kana)
  let k = kana;
  let tail: Array<{ base: string }> = [];
  // trailing kana part of kanjiForm
  const m = kanjiForm.match(/([ぁ-んー]+)$/);
  let core = kanjiForm;
  if (m) {
    const tailKana = m[1];
    core = kanjiForm.slice(0, kanjiForm.length - tailKana.length);
    if (k.endsWith(tailKana)) {
      tail = [{ base: tailKana }];
      k = k.slice(0, k.length - tailKana.length);
    }
  }
  // leading kana part
  const m2 = core.match(/^([ぁ-んー]+)/);
  let head: Array<{ base: string }> = [];
  if (m2) {
    const headKana = m2[1];
    core = core.slice(headKana.length);
    if (k.startsWith(headKana)) {
      head = [{ base: headKana }];
      k = k.slice(headKana.length);
    }
  }
  if (!k) return [...head, { base: core + (m ? m[1] : '') }];
  // now core is all-kanji; distribute k over kanji chars greedily (even split, len-aware)
  const kanjiArr = [...core];
  const n = kanjiArr.length;
  if (k.length < n) return [{ base: kanjiForm, ruby: kana }];
  // dynamic distribution: try to make each kanji's kana chunk a plausible reading (1-4 kana)
  const segs = distribute(k, n);
  if (!segs) return [{ base: kanjiForm, ruby: kana }];
  const out: Array<{ base: string; ruby: string } | { base: string }> = [];
  kanjiArr.forEach((c, i) => { out.push({ base: c, ruby: segs[i] }); });
  return [...head, ...out, ...tail];
}

function distribute(kana: string, n: number): string[] | null {
  if (n === 0) return [];
  if (n === 1) return [kana];
  // simple even-ish distribution favoring 2-3 kana per kanji
  for (let per = 1; per <= 4; per++) {
    if (kana.length === per * n) {
      return Array.from({ length: n }, (_, i) => kana.slice(i * per, (i + 1) * per));
    }
  }
  // try splitting into n chunks of sizes 1..3 that sum to length
  const res: string[] = [];
  const trySplit = (s: string, left: number): boolean => {
    if (left === 0) return s.length === 0;
    for (const sz of [2, 1, 3]) {
      if (s.length >= sz && s.length - sz <= (left - 1) * 3) {
        res.push(s.slice(0, sz));
        if (trySplit(s.slice(sz), left - 1)) return true;
        res.pop();
      }
    }
    return false;
  };
  return trySplit(kana, n) ? res.slice() : null;
}
