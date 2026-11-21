'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  Fuel,
  Mic,
  Plus,
  Shield,
  SlidersHorizontal,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_BILL_PROFILE,
  persistRiderBillProfile,
  readLocalBillProfile,
  RiderBillProfile,
  sliceBillFirstCashflow,
  SupportedLanguage,
} from '@/lib/cashflow-slicer';
import {
  buildCustomWeekRecord,
  computeLearnedPattern,
  INITIAL_WEEKLY_RECORDS,
  WEEKDAYS_ORDER,
  WeekdayName,
  WeeklyEarningsRecord,
} from '@/lib/financial-calendar';
import {
  INITIAL_INCENTIVES,
  PlatformIncentive,
} from '@/lib/bengaluru-calendar';
import FinancialCalendarView from '@/src/components/FinancialCalendarView';
import MultilingualOnboardingModal from '@/src/components/MultilingualOnboardingModal';
import ScreenshotUploadModal from '@/src/components/ScreenshotUploadModal';
import ManualEntryModal from '@/src/components/ManualEntryModal';

interface TransactionRow {
  id: string;
  category: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

const LANG_LABEL: Record<SupportedLanguage, string> = {
  'kn-IN': 'ಕನ್ನಡ',
  'hi-IN': 'हिन्दी',
  'en-IN': 'English',
};

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export default function MinimalRiderHome() {
  const [profile, setProfile] = useState<RiderBillProfile>(DEFAULT_BILL_PROFILE);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [historicalWeeks, setHistoricalWeeks] = useState<WeeklyEarningsRecord[]>(
    INITIAL_WEEKLY_RECORDS
  );
  const [incentives, setIncentives] = useState<PlatformIncentive[]>(
    INITIAL_INCENTIVES
  );
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInitialTab, setManualInitialTab] = useState<'transaction' | 'offer'>(
    'transaction'
  );

  const hasAutoPromptedRef = useRef(false);

  const loadFromSupabase = useCallback(async () => {
    const local = readLocalBillProfile('rider_blr_01');

    if (!supabase) {
      const mergedLocal: RiderBillProfile = {
        ...DEFAULT_BILL_PROFILE,
        ...local,
      };
      setProfile(mergedLocal);
      window.dispatchEvent(
        new CustomEvent('steadygig:lang-change', {
          detail: { language: mergedLocal.preferredLanguage },
        })
      );
      if (!mergedLocal.billSetupCompleted && !hasAutoPromptedRef.current) {
        hasAutoPromptedRef.current = true;
        setShowOnboarding(true);
      }
      setLoading(false);
      return;
    }

    try {
      const [{ data: riderData }, { data: txData }, { data: payoutData }] =
        await Promise.all([
          supabase
            .from('riders')
            .select('*')
            .eq('id', 'rider_blr_01')
            .maybeSingle(),
          supabase
            .from('transactions')
            .select('id, category, amount, type, description, created_at')
            .eq('rider_id', 'rider_blr_01')
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('payout_logs')
            .select(
              'id, week_label, period, total_earnings, order_payout, order_count, incentives, daily_breakdown, created_at'
            )
            .eq('rider_id', 'rider_blr_01')
            .order('created_at', { ascending: true }),
        ]);

      let mergedProfile: RiderBillProfile = {
        ...DEFAULT_BILL_PROFILE,
        ...local,
      };

      if (riderData) {
        const row = riderData as Record<string, unknown>;
        const dbMonthlyBills =
          typeof row.monthly_fixed_bills === 'number'
            ? row.monthly_fixed_bills
            : typeof row.weekly_obligations === 'number' &&
              Number(row.weekly_obligations) > 0 &&
              !local?.monthlyFixedBills
            ? Math.round(Number(row.weekly_obligations) * 4.33)
            : undefined;

        const dbFuel =
          typeof row.daily_fuel_spend === 'number'
            ? row.daily_fuel_spend
            : typeof row.safety_reserve === 'number' &&
              Number(row.safety_reserve) >= 50 &&
              Number(row.safety_reserve) <= 2000 &&
              !local?.dailyFuelSpend
            ? Number(row.safety_reserve)
            : undefined;

        const dbLang =
          row.preferred_language === 'kn-IN' ||
          row.preferred_language === 'hi-IN' ||
          row.preferred_language === 'en-IN'
            ? (row.preferred_language as SupportedLanguage)
            : undefined;

        const dbSetupDone =
          typeof row.bill_setup_completed === 'boolean'
            ? row.bill_setup_completed
            : undefined;

        mergedProfile = {
          riderId: String(row.id || 'rider_blr_01'),
          name: String(row.name || 'Ravi Kumar'),
          platform: String(row.platform || "Domino's (Jubilant FoodWorks)"),
          city: String(row.city || 'Bengaluru'),
          zone: String(row.zone || 'Koramangala & HSR Layout'),
          currentBalance:
            typeof row.balance === 'number'
              ? Number(row.balance)
              : DEFAULT_BILL_PROFILE.currentBalance,
          monthlyFixedBills:
            dbMonthlyBills ??
            local?.monthlyFixedBills ??
            DEFAULT_BILL_PROFILE.monthlyFixedBills,
          billDueDay:
            typeof row.bill_due_day === 'number'
              ? Number(row.bill_due_day)
              : local?.billDueDay ?? DEFAULT_BILL_PROFILE.billDueDay,
          dailyFuelSpend:
            dbFuel ?? local?.dailyFuelSpend ?? DEFAULT_BILL_PROFILE.dailyFuelSpend,
          preferredLanguage:
            dbLang ??
            local?.preferredLanguage ??
            DEFAULT_BILL_PROFILE.preferredLanguage,
          billSetupCompleted:
            dbSetupDone ??
            local?.billSetupCompleted ??
            DEFAULT_BILL_PROFILE.billSetupCompleted,
          dailyEarnings: Number(
            row.daily_earnings ?? DEFAULT_BILL_PROFILE.dailyEarnings
          ),
          targetPayout: Number(
            row.target_payout ?? DEFAULT_BILL_PROFILE.targetPayout
          ),
        };
      }

      setProfile(mergedProfile);
      window.dispatchEvent(
        new CustomEvent('steadygig:lang-change', {
          detail: { language: mergedProfile.preferredLanguage },
        })
      );

      if (!mergedProfile.billSetupCompleted && !hasAutoPromptedRef.current) {
        hasAutoPromptedRef.current = true;
        setShowOnboarding(true);
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

      if (payoutData && payoutData.length > 0) {
        const extras: WeeklyEarningsRecord[] = [];
        for (const row of payoutData) {
          const periodStr = String(row.period || '');
          const labelStr = String(row.week_label || '');
          if (
            periodStr.includes('Oct 19') ||
            periodStr.includes('Nov 09') ||
            labelStr.includes('Oct 19') ||
            labelStr.includes('Nov 09')
          ) {
            continue;
          }

          const breakdownArr = Array.isArray(row.daily_breakdown)
            ? row.daily_breakdown
            : [];
          const dailyTotals: Record<WeekdayName, number> = {
            Monday: 0,
            Tuesday: 0,
            Wednesday: 0,
            Thursday: 0,
            Friday: 0,
            Saturday: 0,
            Sunday: 0,
          };
          WEEKDAYS_ORDER.forEach((day, idx) => {
            const entry = breakdownArr[idx] as { amount?: number } | undefined;
            dailyTotals[day] = Number(
              entry?.amount || Math.round(Number(row.total_earnings) / 7)
            );
          });

          const rec = buildCustomWeekRecord({
            weekLabel: labelStr || periodStr || 'Logged Week',
            startDateISO: /^\d{4}-\d{2}-\d{2}/.test(periodStr)
              ? periodStr.slice(0, 10)
              : '2026-12-01',
            dailyEarnings: dailyTotals,
            orderPayout: Number(row.order_payout || 0),
            incentives: Number(row.incentives || 0),
            lateNightIncentive: Math.round(Number(row.incentives || 0) * 0.25),
            weeklyIncentiveTarget: 2000,
            totalOrders: Number(row.order_count || 120),
            singleRuns: Math.round(Number(row.order_count || 120) * 0.78),
            multiRuns: Math.round(Number(row.order_count || 120) * 0.22),
            dailyExpenseAverage: mergedProfile.dailyFuelSpend || 250,
          });
          rec.id = `sb-${row.id}`;
          rec.source = 'supabase';
          extras.push(rec);
        }

        if (extras.length > 0) {
          setHistoricalWeeks((prev) => {
            const byKey = new Map<string, WeeklyEarningsRecord>();
            for (const w of INITIAL_WEEKLY_RECORDS) byKey.set(w.weekKey, w);
            for (const w of prev) byKey.set(w.weekKey, w);
            for (const w of extras) byKey.set(w.weekKey, w);
            return Array.from(byKey.values());
          });
        }
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
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'payout_logs' },
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

  // Close Calendar modal on Escape key
  useEffect(() => {
    if (!showCalendarModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCalendarModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCalendarModal]);

  const slice = useMemo(() => sliceBillFirstCashflow(profile), [profile]);
  const learnedBaseline = useMemo(
    () => computeLearnedPattern(historicalWeeks),
    [historicalWeeks]
  );

  const handleLanguageQuickSwitch = async (lang: SupportedLanguage) => {
    const updated: RiderBillProfile = { ...profile, preferredLanguage: lang };
    setProfile(updated);
    window.dispatchEvent(
      new CustomEvent('steadygig:lang-change', { detail: { language: lang } })
    );
    await persistRiderBillProfile(updated);
  };

  const handleOnboardingSaved = (updated: RiderBillProfile) => {
    setProfile(updated);
    window.dispatchEvent(
      new CustomEvent('steadygig:lang-change', {
        detail: { language: updated.preferredLanguage },
      })
    );
    setShowOnboarding(false);
    setNotice(
      `Bill Shield saved: ${formatINR(updated.monthlyFixedBills)}/mo due on day ${updated.billDueDay}, ${formatINR(updated.dailyFuelSpend)}/day fuel.`
    );
  };

  const handleWeekAppliedFromScreenshot = (
    record: WeeklyEarningsRecord,
    newBalance: number
  ) => {
    setHistoricalWeeks((prev) => {
      const byKey = new Map<string, WeeklyEarningsRecord>();
      for (const w of prev) byKey.set(w.weekKey, w);
      byKey.set(record.weekKey, record);
      return Array.from(byKey.values());
    });
    setProfile((prev) => ({
      ...prev,
      currentBalance: newBalance,
    }));
    setNotice(
      `Applied ${record.weekLabel} (${formatINR(record.totalEarnings)}) to your Cashflow Slicer & updated future Calendar forecasts.`
    );
  };

  const handleTransactionSaved = (newBalance: number) => {
    setProfile((prev) => ({
      ...prev,
      currentBalance: newBalance,
    }));
    loadFromSupabase();
    setNotice('Entry logged and cashflow buckets recalculated.');
  };

  const handleOfferAdded = (offer: PlatformIncentive) => {
    setIncentives((prev) => [offer, ...prev]);
    setNotice(
      `Saved ${offer.platformName} offer for ${offer.applicableDate} to your Calendar.`
    );
  };

  return (
    <div suppressHydrationWarning className="min-h-screen bg-[#F8FAFC] pb-28 text-[#0F172A]">
      {/* Clean 3-Zone Top Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1380px] items-center justify-between gap-4 px-4 sm:px-6">
          <a
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            SteadyGig
          </a>

          <p className="hidden md:block truncate text-xs font-medium text-slate-500">
            {profile.name} · {profile.platform} · {profile.city} ({profile.zone})
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <div
              className="hidden sm:flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label="Language selector"
            >
              {(['kn-IN', 'hi-IN', 'en-IN'] as SupportedLanguage[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleLanguageQuickSwitch(lang)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    profile.preferredLanguage === lang
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {LANG_LABEL[lang]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowOnboarding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#047857]" />
              <span>Setup Bills</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1380px] space-y-6 px-4 pt-5 sm:px-6 sm:pt-7">
        {/* Feedback Notice */}
        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/75 px-4 py-2.5 text-xs font-medium text-emerald-950"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#047857] shrink-0" />
                <span>{notice}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss notification"
                className="rounded p-1 text-emerald-800 hover:bg-emerald-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Summary + Primary Actions Bar */}
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Bill-First Cashflow Slicer · Total Available Cash
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <h1 className="font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-4xl">
                {formatINR(slice.totalCash)}
              </h1>
              <span className="text-xs text-slate-500">
                1. Fuel Reserve → 2. Bills Shield → 3. Spendable Cash
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowCalendarModal(true)}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Calendar className="h-4 w-4 text-[#047857] shrink-0" />
              <span>Earnings &amp; Festival Calendar</span>
            </button>

            <button
              type="button"
              onClick={() => setShowScreenshotModal(true)}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#047857] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#065F46] whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4 shrink-0" />
              <span>Upload Weekly Payout Screenshot</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setManualInitialTab('transaction');
                setShowManualModal(true);
              }}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4 text-slate-600 shrink-0" />
              <span>Manual Entry</span>
            </button>
          </div>
        </section>

        {/* 3 Clean Scannable Bill-First Cashflow Slicer Cards */}
        <section
          aria-label="Bill-First Cashflow Buckets"
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {/* Card 1: Upcoming Bills Shield */}
          <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  1. Upcoming Bills Shield
                </span>
                <Shield className="h-4 w-4 text-[#047857] shrink-0" />
              </div>

              <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {formatINR(slice.billShieldAllocated)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Shielded toward{' '}
                <span className="font-mono font-semibold text-slate-800 tabular-nums">
                  {formatINR(slice.monthlyFixedBills)}
                </span>{' '}
                Rent + EMI
              </p>

              <div
                className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={slice.billShieldProgressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[#047857] transition-all duration-300"
                  style={{ width: `${slice.billShieldProgressPct}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs">
              <span className="font-medium text-slate-700">
                {slice.daysLeftToDueDate} days left · Due {slice.nextDueDateLabel}
              </span>
              <span className="font-mono font-semibold text-[#047857] tabular-nums">
                {slice.dailyBillQuotaNeeded > 0
                  ? `${formatINR(slice.dailyBillQuotaNeeded)}/day left`
                  : '100% Covered'}
              </span>
            </div>
          </motion.article>

          {/* Card 2: Bike Fuel Reserve */}
          <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.04 }}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  2. Bike Fuel Reserve
                </span>
                <Fuel className="h-4 w-4 text-[#047857] shrink-0" />
              </div>

              <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {formatINR(slice.fuelReserveAllocated)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Daily petrol{' '}
                <span className="font-mono font-semibold text-slate-800 tabular-nums">
                  {formatINR(profile.dailyFuelSpend)}/day
                </span>{' '}
                · {slice.fuelDaysCovered} shifts covered
              </p>

              <p className="mt-4 text-xs leading-relaxed text-slate-600">
                Protected first so you never miss peak login hours due to an
                empty tank.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs">
              <span
                className={`font-semibold ${
                  slice.fuelTomorrowCovered ? 'text-[#047857]' : 'text-amber-700'
                }`}
              >
                {slice.fuelTomorrowCovered
                  ? "Tomorrow's ride fuel protected"
                  : 'Top up for tomorrow shift'}
              </span>
              <span className="font-mono text-slate-500 tabular-nums">
                Target {formatINR(slice.fuelReserveTarget)}
              </span>
            </div>
          </motion.article>

          {/* Card 3: True Spendable Cash */}
          <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.08 }}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  3. True Spendable Cash
                </span>
                <Wallet className="h-4 w-4 text-[#047857] shrink-0" />
              </div>

              <p
                className={`mt-3 font-mono text-3xl font-bold tracking-tight tabular-nums ${
                  slice.trueSpendableCash > 0
                    ? 'text-[#047857]'
                    : 'text-slate-900'
                }`}
              >
                {formatINR(slice.trueSpendableCash)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Guilt-free cash after Fuel &amp; Bill Shield quotas
              </p>

              <p className="mt-4 text-xs leading-relaxed text-slate-600">
                Safe for tea, meals, and personal expenses without touching next
                month&apos;s Rent or EMI.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setManualInitialTab('transaction');
                  setShowManualModal(true);
                }}
                className="font-semibold text-[#047857] hover:text-[#065F46]"
              >
                + Log Expense / Income
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualInitialTab('offer');
                  setShowManualModal(true);
                }}
                className="font-medium text-slate-600 hover:text-slate-900"
              >
                Add Offer →
              </button>
            </div>
          </motion.article>
        </section>

        {/* Lower Workspace: Activity Feed + Recorded Weeks & Forecast */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left 7: Recent Activity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Recent Activity
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Log via Kannada / Hindi / English Voice Mic below or Manual Entry
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Mic className="h-3.5 w-3.5 text-[#047857]" />
                <span>{transactions.length} entries</span>
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
                No entries yet. Use the Voice Mic or click{' '}
                <strong>Manual Entry</strong> to log fuel, food, or cash earned.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const isIncome = tx.type === 'income' || tx.type === 'payout';
                  return (
                    <li
                      key={tx.id}
                      className="flex min-h-[54px] items-center justify-between gap-4 py-3"
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
                          <span className="font-mono tabular-nums">
                            {new Date(tx.created_at).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </p>
                      </div>

                      <span
                        className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                          isIncome ? 'text-[#047857]' : 'text-slate-900'
                        }`}
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

          {/* Right 5: Recorded Payout Weeks & Adaptive Calendar Sync */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Recorded Weekly Payouts
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Screenshots update your cashflow &amp; adaptive Calendar forecast
                </p>
              </div>
              <span className="font-mono text-xs font-semibold text-[#047857] tabular-nums">
                {historicalWeeks.length} wks
              </span>
            </div>

            <div className="mt-3 divide-y divide-slate-100 text-xs">
              {historicalWeeks.map((wk) => (
                <div
                  key={wk.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {wk.weekLabel}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {formatINR(wk.orderPayout)} payout +{' '}
                      {formatINR(wk.incentives)} incentives · {wk.totalOrders}{' '}
                      orders
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-[#047857] tabular-nums shrink-0">
                    {formatINR(wk.totalEarnings)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-600">
                  Adaptive Next-Week Forecast
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatINR(learnedBaseline.predictedNextWeekLow)} –{' '}
                  {formatINR(learnedBaseline.predictedNextWeekHigh)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Average {formatINR(learnedBaseline.averageWeeklyEarnings)}/wk ·
                Strongest days: {learnedBaseline.highIncomePeriods.join(', ')}
              </p>

              <button
                type="button"
                onClick={() => setShowCalendarModal(true)}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              >
                <Calendar className="h-3.5 w-3.5 text-[#047857]" />
                <span>Open Full 12-Month Earnings &amp; Festival Calendar</span>
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* 4-Step Multilingual Onboarding Modal */}
      <MultilingualOnboardingModal
        open={showOnboarding}
        profile={profile}
        onClose={() => setShowOnboarding(false)}
        onSaved={handleOnboardingSaved}
      />

      {/* Ephemeral In-Memory Weekly Payout Screenshot Parser Modal */}
      <ScreenshotUploadModal
        open={showScreenshotModal}
        riderId={profile.riderId}
        currentBalance={profile.currentBalance}
        onClose={() => setShowScreenshotModal(false)}
        onWeekApplied={handleWeekAppliedFromScreenshot}
      />

      {/* Compact Manual Entry Modal (Expense / Platform Offer) */}
      <ManualEntryModal
        open={showManualModal}
        initialTab={manualInitialTab}
        riderId={profile.riderId}
        currentBalance={profile.currentBalance}
        onClose={() => setShowManualModal(false)}
        onTransactionSaved={handleTransactionSaved}
        onOfferAdded={handleOfferAdded}
      />

      {/* On-Demand 12-Month Earnings & Festival Calendar Modal */}
      <AnimatePresence>
        {showCalendarModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Earnings and Festival Calendar"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.2 }}
              className="my-2 w-full max-w-[1380px] rounded-2xl border border-slate-200 bg-[#F8FAFC] shadow-2xl"
            >
              <div className="sticky top-0 z-20 flex items-center justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6">
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-[#047857] shrink-0" />
                  <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                    Earnings &amp; Festival Calendar (Oct 2026 – Sep 2027)
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalendarModal(false)}
                  aria-label="Close calendar"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  <span>Close</span>
                </button>
              </div>

              <div className="p-3 sm:p-6">
                <FinancialCalendarView
                  vaultBalance={slice.billShieldAllocated}
                  onVaultUpdated={loadFromSupabase}
                  externalWeeks={historicalWeeks}
                  externalIncentives={incentives}
                  onAddIncentiveExternal={handleOfferAdded}
                  onRequestUploadScreenshot={() => {
                    setShowCalendarModal(false);
                    setShowScreenshotModal(true);
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
