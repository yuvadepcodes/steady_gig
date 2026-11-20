'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import FinancialCalendarView from '@/src/components/FinancialCalendarView';

interface RiderRow {
  id: string;
  name: string;
  city: string;
  zone: string;
  platform: string;
  balance: number;
  vault_balance: number;
  daily_earnings: number;
  target_payout: number;
  weekly_obligations: number;
}

interface TransactionRow {
  id: string;
  category: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

const FALLBACK_RIDER: RiderRow = {
  id: 'rider_blr_01',
  name: 'Ravi Kumar',
  city: 'Bengaluru',
  zone: 'Koramangala & HSR Layout',
  platform: "Domino's (Jubilant FoodWorks)",
  balance: 1450,
  vault_balance: 5200,
  daily_earnings: 1850,
  target_payout: 6000,
  weekly_obligations: 3900,
};

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export default function MinimalRiderHome() {
  const [rider, setRider] = useState<RiderRow>(FALLBACK_RIDER);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'calendar' | 'vault'>('calendar');
  const [addWeekSignal, setAddWeekSignal] = useState(0);

  const loadFromSupabase = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const [{ data: riderData }, { data: txData }] = await Promise.all([
        supabase
          .from('riders')
          .select(
            'id, name, city, zone, platform, balance, vault_balance, daily_earnings, target_payout, weekly_obligations'
          )
          .eq('id', 'rider_blr_01')
          .maybeSingle(),
        supabase
          .from('transactions')
          .select('id, category, amount, type, description, created_at')
          .eq('rider_id', 'rider_blr_01')
          .order('created_at', { ascending: false })
          .limit(12),
      ]);

      if (riderData) {
        setRider({
          id: riderData.id,
          name: riderData.name,
          city: riderData.city || 'Bengaluru',
          zone: riderData.zone || 'Koramangala & HSR Layout',
          platform: riderData.platform || "Domino's (Jubilant FoodWorks)",
          balance: Number(riderData.balance),
          vault_balance: Number(riderData.vault_balance),
          daily_earnings: Number(riderData.daily_earnings),
          target_payout: Number(riderData.target_payout),
          weekly_obligations: Number(riderData.weekly_obligations || 3900),
        });
      }

      if (txData) {
        setTransactions(
          txData.map((tx) => ({
            id: tx.id,
            category: tx.category,
            amount: Number(tx.amount),
            type: tx.type,
            description: tx.description,
            created_at: tx.created_at,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromSupabase();

    const handleRefresh = () => {
      loadFromSupabase();
    };
    window.addEventListener('steadygig:refresh', handleRefresh);

    const client = supabase;
    const channel = client
      ? client
          .channel('steadygig-live-sync')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'riders' },
            handleRefresh
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'transactions' },
            handleRefresh
          )
          .subscribe()
      : null;

    return () => {
      window.removeEventListener('steadygig:refresh', handleRefresh);
      if (client && channel) {
        client.removeChannel(channel);
      }
    };
  }, [loadFromSupabase]);

  const runwayWeeks = Number(
    (rider.vault_balance / Math.max(1, rider.weekly_obligations)).toFixed(1)
  );
  const runwayPct = Math.min(100, Math.round((runwayWeeks / 3) * 100));

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 text-[#0F172A]">
      {/* Clean 3-Zone Top Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1380px] items-center justify-between gap-8 px-4 sm:px-6">
          <a
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            SteadyGig
          </a>

          <nav className="flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`border-b-2 py-5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'calendar'
                  ? 'border-[#047857] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Financial Calendar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vault')}
              className={`border-b-2 py-5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'vault'
                  ? 'border-[#047857] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Vault &amp; Voice
            </button>
          </nav>

          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('calendar');
                setAddWeekSignal((n) => n + 1);
              }}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Log Week
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1380px] px-2.5 pt-3 sm:px-6 sm:pt-6">
        {activeTab === 'calendar' ? (
          <FinancialCalendarView
            vaultBalance={rider.vault_balance}
            weeklyObligations={rider.weekly_obligations}
            onVaultUpdated={loadFromSupabase}
            openAddWeekModalSignal={addWeekSignal}
          />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Cash-Flow Stability
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {rider.name} · {rider.platform} · {rider.city} ({rider.zone})
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left: Stability Summary */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Available Balance · ಲಭ್ಯವಿರುವ ಹಣ
                </p>
                <p
                  className="mt-1.5 text-4xl font-bold tracking-tight text-slate-900 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatINR(rider.balance)}
                </p>
              </div>
              <Wallet className="h-5 w-5 text-emerald-700 shrink-0" />
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span className="text-xs font-medium text-slate-600">
                    Lean-Week Reserve Vault
                  </span>
                </div>
                <span
                  className="text-base font-semibold text-emerald-700 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatINR(rider.vault_balance)}
                </span>
              </div>

              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={runwayPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[#047857] transition-all duration-300"
                  style={{ width: `${runwayPct}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span
                  className="font-medium text-slate-700 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {runwayWeeks} Lean Weeks Covered
                </span>
                <span>Goal: 3.0 wks ({formatINR(rider.weekly_obligations)}/wk)</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
              <div>
                <p className="text-xs text-slate-500">Today&apos;s Earnings</p>
                <p
                  className="mt-1 text-lg font-semibold text-slate-900 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatINR(rider.daily_earnings)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Weekly Target</p>
                <p
                  className="mt-1 text-lg font-semibold text-slate-900 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatINR(rider.target_payout)}
                </p>
              </div>
            </div>
          </section>

          {/* Right: Live Supabase Activity Feed */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Recent Activity
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Synced live with Supabase · Voice-logged expenses appear here immediately
                </p>
              </div>
              <span className="text-xs font-medium text-emerald-700">
                {transactions.length} entries
              </span>
            </div>

            {loading ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-11 animate-pulse rounded-lg bg-slate-100"
                  />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No transactions logged yet. Tap <strong>ಮಾತನಾಡಿ · Speak</strong> to log your first expense.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const isIncome =
                    tx.type === 'income' || tx.type === 'payout';
                  return (
                    <li
                      key={tx.id}
                      className="flex min-h-[56px] items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {tx.description || tx.category}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          <span className="capitalize font-medium text-slate-700">
                            {tx.category}
                          </span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span
                            className="tabular-nums"
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            {new Date(tx.created_at).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </p>
                      </div>

                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          isIncome ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {isIncome ? '+' : '-'}
                        {formatINR(tx.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
