// Browser-only bridge to uncloseai.js.
// uncloseai.js is loaded by src/app/layout.tsx and runs entirely in the browser.
export interface UncloseAiApi {
  sendMessage(message: string): AsyncIterable<string>;
  speakText(text: string): Promise<void>;
  toggleUncloseaiEmbeddedModal?: () => Promise<void>;
  openTTSModal?: () => void;
  openTranslateModal?: () => void;
}

declare global {
  interface Window {
    uncloseai?: UncloseAiApi;
    UNCLOSEAI_FLOATING_BUTTON?: boolean;
    UNCLOSEAI_CUSTOM_STYLING?: boolean;
    UNCLOSEAI_LANGUAGE?: string | null;
    UNCLOSEAI_SYSTEM_PROMPT?: string;
    UNCLOSEAI_SYSTEM_PROMPT_REPLACE?: boolean;
  }
}

const WAIT_MS = 100;
const MAX_WAIT_MS = 15_000;

export async function getUncloseAI(): Promise<UncloseAiApi> {
  if (typeof window === 'undefined') {
    throw new Error('uncloseai is browser-only');
  }

  const start = Date.now();
  while (!window.uncloseai?.sendMessage) {
    if (Date.now() - start >= MAX_WAIT_MS) {
      throw new Error('uncloseai.js did not finish loading');
    }
    await new Promise(resolve => setTimeout(resolve, WAIT_MS));
  }
  return window.uncloseai;
}

export async function sendUncloseAI(prompt: string): Promise<string> {
  const ai = await getUncloseAI();
  let output = '';
  for await (const chunk of ai.sendMessage(prompt)) {
    output += chunk;
  }
  return output.trim();
}

export async function speakWithUncloseAI(text: string): Promise<void> {
  const ai = await getUncloseAI();
  await ai.speakText(text);
}

export async function generateAiExampleSentence(params: {
  word: string;
  reading?: string;
  level?: number;
  meaning?: string;
}): Promise<{ ja: string; en: string }> {
  const level = params.level && params.level >= 1 && params.level <= 5 ? `N${params.level}` : 'N4';

  const prompt = [
    'You are the Bunsan Jisho Japanese-language example-sentence generator.',
    'Generate exactly ONE natural Japanese example sentence using the target word.',
    'Return ONLY valid JSON with exactly these keys and no markdown: {"ja":"...","en":"..."}.',
    `Target word: ${params.word}`,
    params.reading ? `Reading: ${params.reading}` : '',
    params.meaning ? `Meaning: ${params.meaning}` : '',
    `Requested JLPT level: ${level}`,
  ].filter(Boolean).join('\n');

  const raw = await sendUncloseAI(prompt);
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as { ja?: unknown; en?: unknown };
    if (typeof parsed.ja === 'string' && parsed.ja.trim()) {
      return { ja: parsed.ja.trim(), en: typeof parsed.en === 'string' ? parsed.en.trim() : '' };
    }
  } catch {
    // Fall through to a small tolerant parser for model responses with extra text.
  }

  const jaMatch = cleaned.match(/"ja"\s*:\s*"((?:\\.|[^"])*)"/);
  const enMatch = cleaned.match(/"en"\s*:\s*"((?:\\.|[^"])*)"/);
  if (!jaMatch) throw new Error('uncloseai returned an invalid example sentence');

  const decode = (value: string) => {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value;
    }
  };

  return {
    ja: decode(jaMatch[1]),
    en: enMatch ? decode(enMatch[1]) : '',
  };
}
