// Kana tables + converters (numbers, dates, romaji)
export interface KanaRow { kana: string; romaji: string; }
export interface KanaGroup { label: string; rows: KanaRow[]; }

const g = (label: string, pairs: string[][]): KanaGroup => ({
  label,
  rows: pairs.map(([kana, romaji]) => ({ kana, romaji })),
});

export const HIRAGANA_GROUPS: KanaGroup[] = [
  g('Basic', [['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o']]),
  g('K', [['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko']]),
  g('S', [['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so']]),
  g('T', [['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to']]),
  g('N', [['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no']]),
  g('H', [['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho']]),
  g('M', [['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo']]),
  g('Y', [['や', 'ya'], ['', ''], ['ゆ', 'yu'], ['', ''], ['よ', 'yo']]),
  g('R', [['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro']]),
  g('W / N', [['わ', 'wa'], ['', ''], ['', ''], ['', ''], ['を', 'wo'], ['ん', 'n']]),
];

export const HIRAGANA_DAKUTEN: KanaGroup[] = [
  g('G', [['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go']]),
  g('Z', [['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo']]),
  g('D', [['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do']]),
  g('B', [['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo']]),
  g('P', [['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']]),
];

export const HIRAGANA_COMBO: KanaGroup[] = [
  g('Kya', [['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo']]),
  g('Sha', [['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho']]),
  g('Cha', [['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho']]),
  g('Nya', [['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo']]),
  g('Hya', [['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo']]),
  g('Mya', [['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo']]),
  g('Rya', [['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo']]),
  g('Gya', [['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo']]),
  g('Ja', [['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo']]),
  g('Bya', [['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo']]),
  g('Pya', [['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo']]),
];

export function katakanaOf(row: KanaRow): KanaRow {
  if (!row.kana) return row;
  return { kana: row.kana.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)), romaji: row.romaji };
}

// ---------- number converter ----------
const NUMS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000, 万: 10000, 億: 100000000, 兆: 1000000000000 };
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function numberToKanji(n: number): string {
  if (n === 0) return '零';
  if (n < 0) return 'マイナス' + numberToKanji(-n);
  if (n >= 1000000000000) return kanjiQuotient(n, 1000000000000, '兆') + numberToKanji(n % 1000000000000);
  if (n >= 100000000) return kanjiQuotient(n, 100000000, '億') + numberToKanji(n % 100000000);
  if (n >= 10000) return kanjiQuotient(n, 10000, '万') + numberToKanji(n % 10000);
  let out = '';
  if (n >= 1000) { out += n / 1000 >= 1 && n / 1000 < 2 ? '千' : DIGITS[Math.floor(n / 1000)] + '千'; n %= 1000; }
  if (n >= 100) { out += n / 100 >= 1 && n / 100 < 2 ? '百' : DIGITS[Math.floor(n / 100)] + '百'; n %= 100; }
  if (n >= 10) { out += n / 10 >= 1 && n / 10 < 2 ? '十' : DIGITS[Math.floor(n / 10)] + '十'; n %= 10; }
  if (n > 0) out += DIGITS[n];
  return out || '零';
}
function kanjiQuotient(n: number, unit: number, unitChar: string): string {
  const q = Math.floor(n / unit);
  return (q === 1 ? '' : numberToKanji(q)) + unitChar;
}

const NUM_READING: Record<string, string> = {
  一: 'いち', 二: 'に', 三: 'さん', 四: 'よん', 五: 'ご', 六: 'ろく', 七: 'なな', 八: 'はち', 九: 'きゅう', 十: 'じゅう', 百: 'ひゃく', 千: 'せん', 万: 'まん', 零: 'れい',
};

export function numberToReading(n: number): string {
  return numberToKanji(n).split('').map(c => NUM_READING[c] ?? c).join(' ');
}

/** Parse a kanji numeral string (e.g. 一万二千三百四十五) to a number. Returns null on invalid input. Accepts arabic digits mixed in. */
export function kanjiToNumber(input: string): number | null {
  const s = input.trim().replace(/\s+/g, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  let section = 0; // accumulates < 10000 part of the current 万/億/兆 group
  let cur = 0;
  for (const ch of s) {
    const v = NUMS[ch];
    if (v === undefined) return null;
    if (v >= 10000) {
      const multiplier = section + cur === 0 ? 1 : section + cur;
      section = multiplier * v;
      total += section;
      section = 0; cur = 0;
    } else if (v >= 10) {
      section += (cur === 0 ? 1 : cur) * v;
      cur = 0;
    } else {
      cur += v;
    }
  }
  const result = total + section + cur;
  return result > 0 ? result : null;
}

// ---------- era (元号) converter ----------
export const ERAS = [
  { name: '令和', en: 'Reiwa', kana: 'れいわ', start: 2019, startEraYear: 1 },
  { name: '平成', en: 'Heisei', kana: 'へいせい', start: 1989, startEraYear: 1 },
  { name: '昭和', en: 'Shōwa', kana: 'しょうわ', start: 1926, startEraYear: 1 },
  { name: '大正', en: 'Taishō', kana: 'たいしょう', start: 1912, startEraYear: 1 },
  { name: '明治', en: 'Meiji', kana: 'めいじ', start: 1868, startEraYear: 1 },
] as const;

export function gregorianToEra(y: number) {
  for (const e of ERAS) {
    if (y >= e.start) return { ...e, eraYear: y - e.start + 1 };
  }
  return null;
}

/** eraYear 1 renders as 元年 */
export function formatEraYear(eraYear: number): string {
  return eraYear === 1 ? '元年' : `${eraYear}年`;
}

export function eraToGregorian(eraName: string, eraYear: number): number | null {
  const e = ERAS.find(x => x.name === eraName || x.en === eraName);
  if (!e || eraYear < 1) return null;
  return e.start + eraYear - 1;
}

// ---------- date converter ----------
export const DAYS_WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const DAY_READINGS = ['にち', 'げつ', 'か', 'すい', 'もく', 'きん', 'ど'];
export const MONTHS_OLD = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走'];

export function dateInfo(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = d.getDay();
  const era = (() => {
    if (y >= 2019) return { name: '令和', nameEn: 'Reiwa', years: y - 2018 };
    if (y >= 1989) return { name: '平成', nameEn: 'Heisei', years: y - 1988 };
    if (y >= 1926) return { name: '昭和', nameEn: 'Shōwa', years: y - 1925 };
    return { name: '大正', nameEn: 'Taishō', years: y - 1911 };
  })();
  return {
    kanji: `${y}年${m}月${day}日 (${DAYS_WEEK[dow]}曜日)`,
    reading: `${y}ねん ${m}がつ ${day}にち — ${DAY_READINGS[dow]}ようび`,
    era: `${era.name} ${era.years}年 (${era.nameEn} ${era.years})`,
    oldMonth: MONTHS_OLD[m - 1],
  };
}

// ---------- counters reference ----------
export const COUNTERS = [
  { c: '人', r: 'にん', use: 'people', ex: '三人 (さんにん)' },
  { c: '枚', r: 'まい', use: 'flat objects', ex: '一枚 (いちまい)' },
  { c: '本', r: 'ほん', use: 'long objects', ex: '二本 (にほん)' },
  { c: '匹', r: 'ひき', use: 'small animals', ex: '三匹 (さんびき)' },
  { c: '冊', r: 'さつ', use: 'books', ex: '一冊 (いっさつ)' },
  { c: '台', r: 'だい', use: 'machines', ex: '二台 (にだい)' },
  { c: '個', r: 'こ', use: 'general small items', ex: '五個 (ごこ)' },
  { c: '杯', r: 'はい', use: 'cups/glasses', ex: '三杯 (さんばい)' },
  { c: '階', r: 'かい', use: 'floors', ex: '四階 (よんかい)' },
  { c: '歳', r: 'さい', use: 'age', ex: '二十歳 (はたち)' },
  { c: '回', r: 'かい', use: 'occurrences', ex: '一回 (いっかい)' },
  { c: '頭', r: 'とう', use: 'large animals', ex: '三頭 (さんとう)' },
];

export const PARTICLE_GUIDES = [
  { p: 'は', r: 'wa', use: 'topic marker', ex: '私は学生です。' },
  { p: 'が', r: 'ga', use: 'subject focus / object of existence', ex: '猫がいる。' },
  { p: 'を', r: 'o', use: 'direct object', ex: 'パンを食べる。' },
  { p: 'に', r: 'ni', use: 'destination / time point / indirect object', ex: '学校に行く。' },
  { p: 'で', r: 'de', use: 'location of action / means', ex: '図書館で勉強する。' },
  { p: 'と', r: 'to', use: 'and / with / quotation', ex: '友達と話す。' },
  { p: 'へ', r: 'e', use: 'direction', ex: '日本へ行く。' },
  { p: 'も', r: 'mo', use: 'also / even', ex: '私も行く。' },
  { p: 'から', r: 'kara', use: 'from / because', ex: '九時から始まる。' },
  { p: 'まで', r: 'made', use: 'until', ex: '五時まで働く。' },
  { p: 'の', r: 'no', use: 'possession / attribution', ex: '私の本。' },
  { p: 'や', r: 'ya', use: 'and (non-exhaustive)', ex: 'りんごやみかん。' },
];

export const GRAMMAR_PATTERNS = [
  { pat: '〜ている', lvl: 5, use: 'ongoing action / resultant state', ex: '本を読んでいる。' },
  { pat: '〜たことがある', lvl: 4, use: 'have done before (experience)', ex: '日本へ行ったことがある。' },
  { pat: '〜なければならない', lvl: 4, use: 'must do', ex: '宿題をしなければならない。' },
  { pat: '〜そうだ (hearsay)', lvl: 4, use: 'I heard that', ex: '雨が降るそうだ。' },
  { pat: '〜ようだ', lvl: 3, use: 'it seems that', ex: '彼は疲れているようだ。' },
  { pat: '〜ば〜ほど', lvl: 3, use: 'the more... the more', ex: '考えれば考えるほど分からなくなる。' },
  { pat: '〜にもかかわらず', lvl: 2, use: 'despite / nevertheless', ex: '雨にもかかわらず出発した。' },
  { pat: '〜ざるを得ない', lvl: 1, use: 'cannot help but / have no choice', ex: '認めざるを得ない。' },
  { pat: '〜わけではない', lvl: 2, use: 'it is not the case that', ex: '嫌いなわけではない。' },
  { pat: '〜かねない', lvl: 1, use: 'might (lead to something bad)', ex: '事故になりかねない。' },
];
