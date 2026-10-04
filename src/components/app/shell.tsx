'use client';
// App shell: sidebar, topbar, global search, footer, view routing
import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CommandDialog } from '@/components/ui/command';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard, BookA, SquarePen, Grid3x3, MessageSquareText, TextCursorInput, Repeat,
  GraduationCap, Puzzle, Languages, FolderKanban, BarChart3, Settings, Info, Search,
  Sun, Moon, Menu, Command as CommandIcon, Flame, Sparkles, ScrollText, Bot, BookOpen, Zap,
} from 'lucide-react';
import { useUi, useSettings, useStudy, useLibrary, type ViewId, furiMode } from '@/lib/stores';
import { toast } from '@/hooks/use-toast';
import { searchWordsDeinflected, searchKanji, searchSentences } from '@/lib/dict/search';
import { WORDS, KANJI, SENTENCES } from '@/lib/dict/index';
import { useSpeak } from '@/lib/client';
import { applyLearningSteps } from '@/lib/srs';
import { checkFreezes } from '@/lib/freezes';
import { motion, AnimatePresence } from 'framer-motion';
import { WordDetailSheet, KanjiDetailSheet, SentenceDetailSheet } from './entry-cards';
import { AchievementWatcher } from './achievement-toasts';
import { DictionaryViews } from './views/dictionary';
import { StudyViews } from './views/study';
import { ToolViews } from './views/tools';
import { ManageViews } from './views/manage';
import { TutorView } from './views/tutor';

const NAV: Array<{ id: ViewId; label: string; icon: React.ElementType; group: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'words', label: 'Words', icon: BookA, group: 'Dictionary' },
  { id: 'kanji', label: 'Kanji', icon: SquarePen, group: 'Dictionary' },
  { id: 'radicals', label: 'Radicals', icon: Grid3x3, group: 'Dictionary' },
  { id: 'sentences', label: 'Sentences', icon: MessageSquareText, group: 'Dictionary' },
  { id: 'expressions', label: 'Expressions', icon: ScrollText, group: 'Dictionary' },
  { id: 'grammar', label: 'Grammar', icon: BookOpen, group: 'Dictionary' },
  { id: 'annotator', label: 'Text Annotator', icon: TextCursorInput, group: 'Tools' },
  { id: 'conjugator', label: 'Conjugator', icon: Repeat, group: 'Tools' },
  { id: 'kana', label: 'Kana & Tools', icon: Languages, group: 'Tools' },
  { id: 'tutor', label: 'AI Tutor', icon: Bot, group: 'Learning' },
  { id: 'study', label: 'Study (SRS)', icon: GraduationCap, group: 'Learning' },
  { id: 'quizzes', label: 'Quiz Center', icon: Puzzle, group: 'Learning' },
  { id: 'lists', label: 'Lists & Tags', icon: FolderKanban, group: 'Library' },
  { id: 'stats', label: 'Statistics', icon: BarChart3, group: 'Library' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'System' },
  { id: 'about', label: 'About & Credits', icon: Info, group: 'System' },
];

export function AppShell() {
  const view = useUi(s => s.view);
  const setView = useUi(s => s.setView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const settings = useSettings();
  const { theme, setTheme } = useTheme();

  // live appearance settings: accent, base font scale, JP font family, furigana mode
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-accent', settings.accent);
    el.setAttribute('data-font-size', settings.fontSize);
    el.setAttribute('data-jp-font', settings.jpFont);
    el.setAttribute('data-furi', furiMode(settings));
  }, [settings.accent, settings.fontSize, settings.jpFont, settings.furiganaMode, settings.showFurigana]);

  // sync SRS learning-step preset from settings into the engine
  useEffect(() => {
    applyLearningSteps(settings.learningSteps);
  }, [settings.learningSteps]);

  // streak freeze catch-up on mount (earn 7-day milestones / consume for missed days),
  // then keep watching activity so milestones unlock mid-session
  useEffect(() => {
    Promise.resolve().then(() => checkFreezes(useStudy.getState().activity));
    const unsub = useStudy.subscribe((state, prev) => {
      if (state.activity !== prev.activity) checkFreezes(state.activity);
    });
    return unsub;
  }, []);

  // global keyboard shortcuts (ignored while typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const jump = (v: ViewId) => useUi.getState().setView(v);
      switch (e.key) {
        case 'd': jump('dashboard'); break;
        case 'w': jump('words'); break;
        case 'k': jump('kanji'); break;
        case 'q': jump('quizzes'); break;
        case 's': jump('study'); break;
        case 't': jump('tutor'); break;
        case '?': setShortcutsOpen(o => !o); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // PWA install prompt. The service worker is intentionally omitted on GitHub Pages.
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); (window as unknown as { __bunsanInstallPrompt?: unknown }).__bunsanInstallPrompt = e; window.dispatchEvent(new Event('bunsan-install-available')); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const navClick = (v: ViewId) => { setView(v); setMobileOpen(false); };
  const groups = useMemo(() => {
    const g: Record<string, typeof NAV> = {};
    for (const n of NAV) (g[n.group] ||= []).push(n);
    return g;
  }, []);

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 seigaiha-bg">
        <button className="text-left w-full" onClick={() => navClick('dashboard')} aria-label="Bunsan Jisho home">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
              <span className="text-xl font-bold jp-serif">分</span>
            </div>
            <div>
              <div className="font-bold text-lg leading-tight tracking-tight">Bunsan Jisho</div>
              <div className="text-[11px] text-muted-foreground -mt-0.5">分散辞書 · by Aishik Dutta</div>
            </div>
          </div>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto bunsan-scroll px-2.5 pb-4" aria-label="Main navigation">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{group}</div>
            {items.map(item => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navClick(item.id)}
                  className={`group relative w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-200 mb-0.5 ${active ? 'bg-primary text-primary-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent hover:translate-x-0.5'}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2.5 h-5 w-1 rounded-full bg-primary-foreground/90" aria-hidden />}
                  <Icon className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? 'drop-shadow' : ''}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t">
        <SrsCountBadge />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col app-root" data-accent={settings.accent}>
      <div className="flex flex-1">
        {/* desktop sidebar */}
        <aside className="hidden lg:block w-60 shrink-0 border-r bg-sidebar washi-bg sticky top-0 h-screen no-print">
          {SidebarContent}
        </aside>
        {/* mobile drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="lg:hidden no-print">
            <Button variant="ghost" size="icon" className="m-2 absolute left-0 top-0 z-40" aria-label="open menu"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {SidebarContent}
          </SheetContent>
        </Sheet>

        {/* main column */}
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 max-w-7xl w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
            {view === 'dashboard' && <ManageViews view="dashboard" />}
            {view === 'words' && <DictionaryViews view="words" />}
            {view === 'kanji' && <DictionaryViews view="kanji" />}
            {view === 'radicals' && <DictionaryViews view="radicals" />}
            {view === 'sentences' && <DictionaryViews view="sentences" />}
            {view === 'expressions' && <DictionaryViews view="expressions" />}
            {view === 'grammar' && <DictionaryViews view="grammar" />}
            {view === 'annotator' && <ToolViews view="annotator" />}
            {view === 'conjugator' && <ToolViews view="conjugator" />}
            {view === 'kana' && <ToolViews view="kana" />}
            {view === 'tutor' && <TutorView />}
            {view === 'study' && <StudyViews view="study" />}
            {view === 'quizzes' && <StudyViews view="quizzes" />}
            {view === 'lists' && <ManageViews view="lists" />}
            {view === 'stats' && <ManageViews view="stats" />}
            {view === 'settings' && <ManageViews view="settings" />}
            {view === 'about' && <ManageViews view="about" />}
              </motion.div>
            </AnimatePresence>
          </main>
          <footer className="mt-auto border-t bg-sidebar/60 no-print">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs text-muted-foreground">
              <p><span className="font-semibold text-foreground">Bunsan Jisho</span> 分散辞書 — crafted by <span className="font-medium text-foreground">Aishik Dutta</span></p>
              <p>Data: JMdict · KANJIDIC2 · KRADFILE (EDRDG) · KanjiVG (CC BY-SA 3.0) · Tatoeba · JLPT lists — licensed under CC BY-SA 4.0 / EDRDG</p>
            </div>
          </footer>
        </div>
      </div>

      {/* overlays */}
      <WordDetailSheet />
      <KanjiDetailSheet />
      <SentenceDetailSheet />
      <CommandPalette />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AchievementWatcher />
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['/', 'Focus global search'],
  ['Ctrl / ⌘ + K', 'Command palette'],
  ['Space', 'Reveal flashcard'],
  ['1 – 4', 'Grade flashcard (Again / Hard / Good / Easy)'],
  ['D', 'Dashboard'],
  ['W', 'Words'],
  ['K', 'Kanji'],
  ['Q', 'Quiz Center'],
  ['S', 'Study (SRS)'],
  ['T', 'AI Tutor'],
  ['Esc', 'Close panels'],
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2"><CommandIcon className="h-4 w-4 text-primary" />Keyboard shortcuts <span className="jp-sans text-xs text-muted-foreground font-normal">キーボード</span></DialogTitle>
          <DialogDescription>Work faster — press <kbd className="rounded border bg-muted px-1">?</kbd> anywhere to toggle this panel.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1.5">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent/50 transition">
              <span className="text-muted-foreground">{d}</span>
              <kbd className="rounded-md border bg-muted px-2 py-0.5 text-xs font-mono shadow-sm">{k}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SrsCountBadge() {
  const cards = useStudy(s => s.cards);
  const now = Date.now();
  const due = Object.values(cards).filter(c => c.due <= now && c.state !== 'new').length;
  const fresh = Object.values(cards).filter(c => c.state === 'new').length;
  return (
    <button className="w-full rounded-lg border bg-card p-2.5 text-left hover:border-primary/40 transition" onClick={() => useUi.getState().setView('study')} aria-label="study queue">
      <div className="flex items-center gap-2 text-sm font-medium"><GraduationCap className="h-4 w-4 text-primary" />Study queue</div>
      <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
        <span>{due} due</span>·<span>{fresh} new</span>
      </div>
    </button>
  );
}

function TopBar() {
  const ui = useUi();
  const study = useStudy();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const setPalette = useUi(s => s.setPalette);
  const results = useMemo(() => {
    if (q.trim().length < 1) return null;
    const { items: words, deinflected } = searchWordsDeinflected(q, {}, { wildcard: true }, 8);
    const kanji = searchKanji(q, {}, 5);
    const sentences = searchSentences(q, {}, 4);
    return { words, kanji, sentences, deinflected };
  }, [q]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setPalette]);

  return (
    <header className="sticky top-0 z-30 glass border-b no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        <div className="lg:hidden w-10" />
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="global-search"
            className="pl-9 pr-16 bg-card/80"
            placeholder="Search Japanese, English or romaji… ( / )"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            aria-label="Global search"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <CommandIcon className="h-3 w-3" />K
          </kbd>
          {open && results && (
            <div className="absolute top-12 left-0 right-0 rounded-xl border bg-popover shadow-xl overflow-hidden z-50">
              <div className="max-h-[70vh] overflow-y-auto bunsan-scroll p-2">
                {results.deinflected && results.deinflected.length > 0 && (
                  <div className="mx-1 mb-1.5 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs">
                    <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <p className="leading-snug text-foreground/90">
                      <span className="jp-sans font-semibold">“{q.trim()}”</span> is <span className="text-emerald-700 dark:text-emerald-300 font-medium">{results.deinflected[0].chain || 'an inflected form'}</span> of{' '}
                      <button className="jp-sans font-bold underline underline-offset-2 decoration-emerald-500/60 hover:decoration-emerald-500" onMouseDown={e => { e.preventDefault(); ui.openWord(results.deinflected![0].word.id); setOpen(false); }}>
                        {results.deinflected[0].word.k || results.deinflected[0].word.a[0]}
                      </button>
                      {results.deinflected.length > 1 && <span className="text-muted-foreground"> · {results.deinflected.length - 1} more matches below</span>}
                    </p>
                    <button
                      className="ml-auto shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition"
                      title={`Add ${results.deinflected[0].word.k || results.deinflected[0].word.a[0]} to SRS`}
                      aria-label="add dictionary form to SRS"
                      onMouseDown={e => {
                        e.preventDefault();
                        const w0 = results.deinflected![0].word;
                        study.enroll([`w:${w0.id}`]);
                        toast({ title: `Added ${w0.k || w0.a[0]} to SRS`, description: `The dictionary form behind “${q.trim()}” will appear in your next session.` });
                        setOpen(false);
                      }}
                    >
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {results.words.length === 0 && results.kanji.length === 0 && results.sentences.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">No results for “{q}”</div>
                )}
                {results.words.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Words</div>
                    {results.words.map(w => (
                      <button key={w.id} className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-accent transition text-left"
                        onMouseDown={e => { e.preventDefault(); ui.openWord(w.id); setOpen(false); }}>
                        <span className="jp-sans font-medium">{w.k || w.a[0]}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[60%]">{w.s[0]?.gloss}</span>
                      </button>
                    ))}
                  </>
                )}
                {results.kanji.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kanji</div>
                    <div className="flex flex-wrap gap-1.5 px-2 py-1">
                      {results.kanji.map(k => (
                        <button key={k.c} className="w-9 h-9 rounded-lg border bg-card text-xl jp-serif hover:border-primary/50" onMouseDown={e => { e.preventDefault(); ui.openKanji(k.c); setOpen(false); }} aria-label={k.c}>{k.c}</button>
                      ))}
                    </div>
                  </>
                )}
                {results.sentences.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sentences</div>
                    {results.sentences.map(s => (
                      <button key={s.id} className="w-full rounded-lg px-2.5 py-1.5 text-sm hover:bg-accent transition text-left" onMouseDown={e => { e.preventDefault(); ui.openSentence(s.id); setOpen(false); }}>
                        <div className="jp-sans">{s.ja}</div>
                        <div className="text-xs text-muted-foreground truncate">{s.en}</div>
                      </button>
                    ))}
                  </>
                )}
                <div className="border-t mt-1 pt-1 px-2">
                  <button className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-accent" onMouseDown={e => { e.preventDefault(); ui.setQuery(q); ui.setView('words'); setOpen(false); }}>
                    See all results in Words →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setPalette(true)} aria-label="command palette"><Sparkles className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="toggle theme">
            <Sun className="h-4 w-4 dark:hidden" /><Moon className="h-4 w-4 hidden dark:block" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function CommandPalette() {
  const open = useUi(s => s.paletteOpen);
  const setPalette = useUi(s => s.setPalette);
  const setView = useUi(s => s.setView);
  const ui = useUi();
  const speak = useSpeak();
  const library = useLibrary();
  const [run, setRun] = useState(0);

  const randomWord = useMemo(() => WORDS[Math.floor(Math.random() * WORDS.length)], [run]);
  const randomKanji = useMemo(() => KANJI[Math.floor(Math.random() * KANJI.length)], [run]);

  return (
    <CommandDialog open={open} onOpenChange={setPalette}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList className="bunsan-scroll">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick search">
          <CommandItem onSelect={() => { setView('words'); setPalette(false); }}>Search words…</CommandItem>
          <CommandItem onSelect={() => { ui.openWord(randomWord.id); setPalette(false); }}>🎲 Random word</CommandItem>
          <CommandItem onSelect={() => { ui.openKanji(randomKanji.c); setPalette(false); }}>🎲 Random kanji</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {NAV.map(n => (
            <CommandItem key={n.id} onSelect={() => { setView(n.id); setPalette(false); }}>{n.label}</CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Saved searches">
          {library.savedSearches.length === 0 && <CommandItem disabled>No saved searches yet</CommandItem>}
          {library.savedSearches.map(ss => (
            <CommandItem key={ss.id} onSelect={() => { ui.setQuery(ss.query); setView(ss.kind === 'kanji' ? 'kanji' : ss.kind === 'sentences' ? 'sentences' : 'words'); setPalette(false); }}>⭐ {ss.name} — “{ss.query}”</CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
