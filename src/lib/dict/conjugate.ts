// Japanese conjugation engine
import type { WordEntry } from './types';
import { verbClass, type VerbClass } from './index';
import { toHira } from './convert';

export interface Conjugation {
  name: string;
  form: string;
  note?: string;
}

const GODAN = { あ: 'わ', い: 'い', う: 'う', え: 'え', お: 'お' };
const GODAN_KA: Record<string, Record<string, string>> = {
  う: { a: 'わ', i: 'い', u: 'う', e: 'え', o: 'お' },
  く: { a: 'か', i: 'き', u: 'く', e: 'け', o: 'こ' },
  ぐ: { a: 'が', i: 'ぎ', u: 'ぐ', e: 'げ', o: 'ご' },
  す: { a: 'さ', i: 'し', u: 'す', e: 'せ', o: 'そ' },
  つ: { a: 'た', i: 'ち', u: 'つ', e: 'て', o: 'と' },
  ぬ: { a: 'な', i: 'に', u: 'ぬ', e: 'ね', o: 'の' },
  ぶ: { a: 'ば', i: 'び', u: 'ぶ', e: 'べ', o: 'ぼ' },
  む: { a: 'ま', i: 'み', u: 'む', e: 'め', o: 'も' },
  る: { a: 'ら', i: 'り', u: 'る', e: 'れ', o: 'ろ' },
};

export function conjugate(word: WordEntry): { cls: VerbClass; stem: string; forms: Conjugation[] } | null {
  const cls = verbClass(word);
  if (!cls) return null;
  const reading = toHira(word.a[0]);
  if (!reading) return null;

  const forms: Conjugation[] = [];
  if (cls === 'ru' || cls === 'u' || cls === 'suru' || cls === 'kuru') {
    let stem = '';
    if (cls === 'ru') stem = reading.slice(0, -1);
    else if (cls === 'u') {
      stem = reading.slice(0, -1);
    } else if (cls === 'suru') stem = reading.endsWith('する') ? reading.slice(0, -2) : reading;
    else if (cls === 'kuru') stem = reading === 'くる' ? 'こ' : reading.slice(0, -2);

    const last = reading[reading.length - 1];
    const mizen = cls === 'ru' ? stem : cls === 'u' ? stem + (GODAN_KA[last]?.a ?? last) : cls === 'suru' ? (reading.endsWith('する') ? reading.slice(0, -2) + 'し' : 'し') : stem;
    const renyou = cls === 'ru' ? stem : cls === 'u' ? stem + (GODAN_KA[last]?.i ?? last) : cls === 'suru' ? (reading.endsWith('する') ? reading.slice(0, -2) + 'し' : 'し') : stem;
    const shuushi = reading;
    const katei = cls === 'ru' ? stem + 'れ' : cls === 'u' ? stem + (GODAN_KA[last]?.e ?? last) + 'れ' : cls === 'suru' ? (reading.endsWith('する') ? reading.slice(0, -2) + 'すれ' : 'すれ') : stem + 'れ';
    const meirei = cls === 'ru' ? stem + 'ろ' : cls === 'u' ? stem + (GODAN_KA[last]?.e ?? last) : cls === 'suru' ? 'しろ' : 'こい';
    const te = cls === 'ru' ? stem + 'て' : cls === 'u'
      ? (last === 'く' ? stem + 'いて' : last === 'ぐ' ? stem + 'いで' : last === 'つ' || last === 'る' || last === 'う' ? stem + 'って' : last === 'む' || last === 'ぶ' || last === 'ぬ' ? stem + 'んで' : last === 'す' ? stem + 'して' : reading + 'て')
      : cls === 'suru' ? (reading.endsWith('する') ? reading.slice(0, -2) + 'して' : 'して') : 'きて';
    const ta = te.replace(/で$/, 'で').replace(/(て|で)$/, m => (m === 'て' ? 'た' : 'だ'));

    if (cls === 'u') {
      forms.push({ name: 'Masu-stem (連用形)', form: renyou + 'ます' });
      forms.push({ name: 'Negative (ない-form)', form: mizen + 'ない' });
      forms.push({ name: 'Past (た-form)', form: ta });
      forms.push({ name: 'Te-form', form: te });
      forms.push({ name: 'Potential', form: stem + (GODAN_KA[last]?.e ?? last) + 'る' });
      forms.push({ name: 'Passive', form: mizen + 'れる' });
      forms.push({ name: 'Causative', form: mizen + 'せる' });
      forms.push({ name: 'Causative-passive', form: mizen + 'せられる' });
      forms.push({ name: 'Imperative', form: meirei });
      forms.push({ name: 'Volitional (よう)', form: stem + (GODAN_KA[last]?.o ?? last) + 'う' });
      forms.push({ name: 'Conditional (ば)', form: stem + (GODAN_KA[last]?.e ?? last) + 'ば' });
      forms.push({ name: 'Tai (want to)', form: renyou + 'たい' });
      forms.push({ name: 'Progressive', form: te + 'いる' });
      if (word.k === '行く') { forms[3].form = '行って'; forms[3].note = 'irregular いって'; }
    } else if (cls === 'ru') {
      forms.push({ name: 'Masu-stem (連用形)', form: stem + 'ます' });
      forms.push({ name: 'Negative (ない-form)', form: stem + 'ない' });
      forms.push({ name: 'Past (た-form)', form: stem + 'た' });
      forms.push({ name: 'Te-form', form: stem + 'て' });
      forms.push({ name: 'Potential', form: stem + 'られる' });
      forms.push({ name: 'Passive', form: stem + 'られる' });
      forms.push({ name: 'Causative', form: stem + 'させる' });
      forms.push({ name: 'Causative-passive', form: stem + 'させられる' });
      forms.push({ name: 'Imperative', form: meirei + '／' + stem + 'よ' });
      forms.push({ name: 'Volitional (よう)', form: stem + 'よう' });
      forms.push({ name: 'Conditional (ば)', form: stem + 'れば' });
      forms.push({ name: 'Tai (want to)', form: stem + 'たい' });
      forms.push({ name: 'Progressive', form: stem + 'ている' });
    } else if (cls === 'suru') {
      const st = reading.endsWith('する') ? reading.slice(0, -2) : reading;
      forms.push({ name: 'Masu-stem', form: st + 'します' });
      forms.push({ name: 'Negative', form: st + 'しない' });
      forms.push({ name: 'Past', form: st + 'した' });
      forms.push({ name: 'Te-form', form: st + 'して' });
      forms.push({ name: 'Potential', form: st + 'できる' });
      forms.push({ name: 'Passive', form: st + 'される' });
      forms.push({ name: 'Causative', form: st + 'させる' });
      forms.push({ name: 'Causative-passive', form: st + 'させられる' });
      forms.push({ name: 'Imperative', form: st + 'しろ／せよ' });
      forms.push({ name: 'Volitional', form: st + 'しよう' });
      forms.push({ name: 'Conditional (ば)', form: st + 'すれば' });
      forms.push({ name: 'Tai (want to)', form: st + 'したい' });
      forms.push({ name: 'Progressive', form: st + 'している' });
    } else {
      forms.push({ name: 'Masu-stem', form: 'きます' });
      forms.push({ name: 'Negative', form: 'こない' });
      forms.push({ name: 'Past', form: 'きた' });
      forms.push({ name: 'Te-form', form: 'きて' });
      forms.push({ name: 'Potential', form: 'こられる' });
      forms.push({ name: 'Passive', form: 'こられる' });
      forms.push({ name: 'Causative', form: 'こさせる' });
      forms.push({ name: 'Causative-passive', form: 'こさせられる' });
      forms.push({ name: 'Imperative', form: 'こい' });
      forms.push({ name: 'Volitional', form: 'こよう' });
      forms.push({ name: 'Conditional (ば)', form: 'くれば' });
      forms.push({ name: 'Tai (want to)', form: 'きたい' });
      forms.push({ name: 'Progressive', form: 'きている' });
    }
  } else if (cls === 'adj-i') {
    const st = reading.endsWith('い') ? reading.slice(0, -1) : reading;
    forms.push({ name: 'Polite', form: st + 'いです' });
    forms.push({ name: 'Negative', form: st + 'くない' });
    forms.push({ name: 'Past', form: st + 'かった' });
    forms.push({ name: 'Past negative', form: st + 'くなかった' });
    forms.push({ name: 'Te-form', form: st + 'くて' });
    forms.push({ name: 'Adverbial', form: st + 'く' });
    forms.push({ name: 'Conditional (ば)', form: st + 'ければ' });
    forms.push({ name: 'Nominalizer', form: st + 'さ' });
  } else if (cls === 'adj-na') {
    const st = reading;
    forms.push({ name: 'Polite', form: st + 'です' });
    forms.push({ name: 'Negative', form: st + 'ではない' });
    forms.push({ name: 'Past', form: st + 'だった' });
    forms.push({ name: 'Past negative', form: st + 'ではなかった' });
    forms.push({ name: 'Te-form', form: st + 'で' });
    forms.push({ name: 'Adverbial', form: st + 'に' });
    forms.push({ name: 'Attributive', form: st + 'な' });
  }
  return { cls, stem: reading, forms };
}
