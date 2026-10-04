'use client';
import dynamic from 'next/dynamic';

const AppShell = dynamic(() => import('@/components/app/shell').then(m => m.AppShell), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <span className="text-3xl font-bold text-primary jp-serif">分</span>
        </div>
        <p className="text-sm text-muted-foreground">Loading Bunsan Jisho…</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <AppShell />;
}
