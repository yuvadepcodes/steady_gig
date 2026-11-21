'use client';

import dynamic from 'next/dynamic';

const MinimalRiderHome = dynamic(
  () => import('@/src/components/MinimalRiderHome'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="font-mono text-xs text-slate-400">Loading SteadyGig Co-Pilot...</p>
        </div>
      </div>
    ),
  }
);

export default function HomePage() {
  return <MinimalRiderHome />;
}
