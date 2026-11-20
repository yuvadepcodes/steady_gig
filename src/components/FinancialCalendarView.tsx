'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Upload,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  buildDayInsight,
  BENGALURU_12_MONTH_PLAN,
  CALENDAR_COLORS,
  DayInsight,
  FestivalEvent,
  getDaysInMonth,
  getFirstWeekdayOfMonth,
  getMonthActualEarningsSummary,
  INITIAL_FESTIVAL_EVENTS,
  INITIAL_INCENTIVES,
  MonthCalendarPlan,
  PlatformIncentive,
} from '@/lib/bengaluru-calendar';
import {
  buildCustomWeekRecord,
  computeLearnedPattern,
  INITIAL_WEEKLY_RECORDS,
  WEEKDAYS_ORDER,
  WeekdayName,
  WeeklyEarningsRecord,
} from '@/lib/financial-calendar';

interface FinancialCalendarViewProps {
  vaultBalance: number;
  weeklyObligations?: number;
  onVaultUpdated?: () => void;
  openAddWeekModalSignal?: number;
  externalWeeks?: WeeklyEarningsRecord[];
  externalIncentives?: PlatformIncentive[];
  onAddIncentiveExternal?: (inc: PlatformIncentive) => void;
  onRequestUploadScreenshot?: () => void;
}

const WEEKDAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatCompactINR(value: number): string {
  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `₹${Math.round(value)}`;
}

function getDemandSurfaceClasses(
  color: 'RED' | 'YELLOW' | 'GREEN',
  hasFestival: boolean
) {
  if (hasFestival) {
    return 'bg-purple-50 ring-1 ring-[#A855F7]/70 text-slate-900';
  }
  if (color === 'RED') return 'bg-red-50/90 text-slate-900';
  if (color === 'GREEN') return 'bg-green-50/90 text-slate-900';
  return 'bg-yellow-50/85 text-slate-900';
}

function getLargeDaySurfaceClasses(color: 'RED' | 'YELLOW' | 'GREEN') {
  if (color === 'RED') return 'border-red-200 bg-red-50/70';
  if (color === 'GREEN') return 'border-green-200 bg-green-50/70';
  return 'border-yellow-200 bg-yellow-50/70';
}

interface HoveredDayState {
  month: MonthCalendarPlan;
  insight: DayInsight;
  colHint: 'left' | 'center' | 'right';
}

export default function FinancialCalendarView({
  vaultBalance,
  onVaultUpdated,
  openAddWeekModalSignal = 0,
  externalWeeks,
  externalIncentives,
  onAddIncentiveExternal,
  onRequestUploadScreenshot,
}: FinancialCalendarViewProps) {
  // Current day tracking (defaults to 2026-11-20 for SSR safety, syncs to browser local date on mount)
  const [todayISO, setTodayISO] = useState<string>('2026-11-20');

  // Active selected month (0 = Oct 2026 .. 11 = Sep 2027) & day
  const [activeMonthIdx, setActiveMonthIdx] = useState<number>(1);
  const [selectedDayNum, setSelectedDayNum] = useState<number>(20);
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

  // Hovered day tooltip state inside rectangular poster
  const [hoveredDay, setHoveredDay] = useState<HoveredDayState | null>(null);

  useEffect(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const current = `${yyyy}-${mm}-${dd}`;
    setTodayISO(current);

    const foundMonthIdx = BENGALURU_12_MONTH_PLAN.findIndex(
      (m) => m.year === yyyy && m.monthIndex === now.getMonth()
    );
    if (foundMonthIdx >= 0) {
      setActiveMonthIdx(foundMonthIdx);
      setSelectedDayNum(now.getDate());
    }
  }, []);

  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  // Lower planning workspace tabs
  const [plannerTab, setPlannerTab] = useState<
    'planner' | 'incentives' | 'festivals'
  >('planner');

  // Editable Festival & Islamic Holiday Dates
  const [festivals, setFestivals] = useState<FestivalEvent[]>(
    INITIAL_FESTIVAL_EVENTS
  );
  const [editingFestivalId, setEditingFestivalId] = useState<string | null>(null);
  const [editingFestivalDate, setEditingFestivalDate] = useState<string>('');

  // Editable Platform Incentives
  const [incentives, setIncentives] = useState<PlatformIncentive[]>(
    externalIncentives && externalIncentives.length > 0
      ? externalIncentives
      : INITIAL_INCENTIVES
  );
  const [showIncentiveForm, setShowIncentiveForm] = useState(false);
  const [incPlatform, setIncPlatform] = useState('Swiggy');
  const [incDate, setIncDate] = useState('2026-12-31');
  const [incTime, setIncTime] = useState('6 PM–12 AM');
  const [incOrdersReq, setIncOrdersReq] = useState('14');
  const [incMinEarn, setIncMinEarn] = useState('₹900 minimum order payout');
  const [incBonus, setIncBonus] = useState('350');
  const [incRainSurge, setIncRainSurge] = useState(
    'Extra ₹20/order if rain alert active'
  );
  const [incEligibility, setIncEligibility] = useState(
    '85% acceptance rate during dinner peak'
  );
  const [incExpiry, setIncExpiry] = useState('2026-12-31');
  const [incVerified, setIncVerified] = useState(true);

  // Actual Historical Earnings connected to Supabase payout_logs & external screenshot uploads
  const [internalWeeks, setInternalWeeks] = useState<WeeklyEarningsRecord[]>(
    INITIAL_WEEKLY_RECORDS
  );
  const historicalWeeks = useMemo(() => {
    if (!externalWeeks || externalWeeks.length === 0) return internalWeeks;
    const byKey = new Map<string, WeeklyEarningsRecord>();
    for (const w of internalWeeks) byKey.set(w.weekKey, w);
    for (const w of externalWeeks) byKey.set(w.weekKey, w);
    return Array.from(byKey.values());
  }, [externalWeeks, internalWeeks]);

  useEffect(() => {
    if (!externalIncentives || externalIncentives.length === 0) return;
    setIncentives((prev) => {
      const known = new Set(prev.map((i) => i.id));
      const added = externalIncentives.filter((i) => !known.has(i.id));
      return added.length > 0 ? [...added, ...prev] : prev;
    });
  }, [externalIncentives]);

  const [lockingVault, setLockingVault] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Add Actual Weekly Earnings Modal
  const [showLogWeekModal, setShowLogWeekModal] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [newWeekLabel, setNewWeekLabel] = useState('Dec 01–07, 2026');
  const [newWeekStart, setNewWeekStart] = useState('2026-12-01');
  const [newOrderPayout, setNewOrderPayout] = useState('5200');
  const [newIncentives, setNewIncentives] = useState('1300');
  const [newOrders, setNewOrders] = useState('190');
  const [newDailyMap, setNewDailyMap] = useState<Record<WeekdayName, string>>({
    Monday: '720',
    Tuesday: '760',
    Wednesday: '790',
    Thursday: '820',
    Friday: '960',
    Saturday: '1150',
    Sunday: '1300',
  });

  useEffect(() => {
    if (openAddWeekModalSignal > 0) {
      setShowLogWeekModal(true);
    }
  }, [openAddWeekModalSignal]);

  const loadSupabaseWeeks = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('payout_logs')
      .select(
        'id, week_label, period, total_earnings, order_payout, order_count, incentives, daily_breakdown, created_at'
      )
      .eq('rider_id', 'rider_blr_01')
      .order('created_at', { ascending: true });

    if (error || !data) return;

    const extras: WeeklyEarningsRecord[] = [];
    for (const row of data) {
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
        dailyExpenseAverage: 240,
      });
      rec.id = `sb-${row.id}`;
      rec.source = 'supabase';
      extras.push(rec);
    }

    if (extras.length > 0) {
      setInternalWeeks([...INITIAL_WEEKLY_RECORDS, ...extras]);
    }
  }, []);

  useEffect(() => {
    loadSupabaseWeeks();
  }, [loadSupabaseWeeks]);

  const activeMonth: MonthCalendarPlan = BENGALURU_12_MONTH_PLAN[activeMonthIdx];
  const daysInActiveMonth = getDaysInMonth(
    activeMonth.year,
    activeMonth.monthIndex
  );
  const firstWeekday = getFirstWeekdayOfMonth(
    activeMonth.year,
    activeMonth.monthIndex
  );
  const clampedSelectedDay = Math.min(selectedDayNum, daysInActiveMonth);

  const activeMonthInsights = useMemo(() => {
    const list: DayInsight[] = [];
    for (let d = 1; d <= daysInActiveMonth; d++) {
      list.push(
        buildDayInsight({
          month: activeMonth,
          dayNumber: d,
          festivals,
          incentives,
          historicalWeeks,
        })
      );
    }
    return list;
  }, [activeMonth, daysInActiveMonth, festivals, incentives, historicalWeeks]);

  const selectedDayInsight =
    activeMonthInsights[clampedSelectedDay - 1] || activeMonthInsights[0];

  const learnedBaseline = useMemo(
    () => computeLearnedPattern(historicalWeeks),
    [historicalWeeks]
  );

  const totalRecordedSummary = useMemo(() => {
    return historicalWeeks.reduce(
      (acc, w) => ({
        totalEarnings: acc.totalEarnings + w.totalEarnings,
        orderPayout: acc.orderPayout + w.orderPayout,
        incentives: acc.incentives + w.incentives,
        totalOrders: acc.totalOrders + w.totalOrders,
      }),
      { totalEarnings: 0, orderPayout: 0, incentives: 0, totalOrders: 0 }
    );
  }, [historicalWeeks]);

  const activeMonthActual = useMemo(
    () => getMonthActualEarningsSummary(activeMonth.id, historicalWeeks),
    [activeMonth.id, historicalWeeks]
  );

  const activeMonthPredictedEarnings = useMemo(() => {
    return activeMonthInsights.reduce(
      (sum, d) =>
        sum + Math.round((d.estimatedIncomeLow + d.estimatedIncomeHigh) / 2),
      0
    );
  }, [activeMonthInsights]);

  const activeMonthFuelAndMaint = useMemo(() => {
    return activeMonthInsights.reduce(
      (sum, d) => sum + d.estimatedFuelAndMaintenance,
      0
    );
  }, [activeMonthInsights]);

  const activeMonthRecommendedSavings = useMemo(() => {
    return activeMonthInsights.reduce((sum, d) => sum + d.recommendedSavings, 0);
  }, [activeMonthInsights]);

  const openMonthOrDayDetails = (monthIdx: number, dayNum?: number) => {
    setActiveMonthIdx(monthIdx);
    setSelectedWeekFilter(null);
    const targetMonth = BENGALURU_12_MONTH_PLAN[monthIdx];
    if (typeof dayNum === 'number') {
      setSelectedDayNum(dayNum);
    } else {
      const mm = String(targetMonth.monthIndex + 1).padStart(2, '0');
      const firstFest = festivals.find((f) =>
        f.dateISO.startsWith(`${targetMonth.year}-${mm}`)
      );
      setSelectedDayNum(firstFest ? Number(firstFest.dateISO.slice(8, 10)) : 1);
    }
    setDetailsOpen(true);
    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 60);
  };

  const handleSaveFestivalDate = (id: string) => {
    if (!editingFestivalDate) return;
    setFestivals((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              dateISO: editingFestivalDate,
              tentative: false,
              demandNote: 'Confirmed date updated by rider',
            }
          : f
      )
    );
    setEditingFestivalId(null);
    setStatusMessage('Festival / holiday date updated on the calendar.');
  };

  const handleAddIncentive = (e: React.FormEvent) => {
    e.preventDefault();
    const newInc: PlatformIncentive = {
      id: `inc-${Date.now()}`,
      platformName: incPlatform.trim() || 'Swiggy',
      applicableDate: incDate,
      timeWindow: incTime.trim() || '6 PM–11 PM',
      ordersRequired: incOrdersReq ? Number(incOrdersReq) : null,
      minEarningsCondition: incMinEarn.trim() || 'Check app terms',
      bonusAmount: incBonus ? Number(incBonus) : null,
      rainOrSurgeBonus: incRainSurge.trim() || 'None specified',
      eligibilityConditions: incEligibility.trim() || 'Standard rider terms',
      expiryDate: incExpiry || incDate,
      verifiedByRider: incVerified,
      statusNote: incVerified
        ? 'Verified by rider from app'
        : 'Check actual rider app offer.',
    };
    setIncentives((prev) => [newInc, ...prev]);
    if (onAddIncentiveExternal) {
      onAddIncentiveExternal(newInc);
    }
    setShowIncentiveForm(false);
    setStatusMessage(
      `Saved ${newInc.platformName} incentive for ${newInc.applicableDate}.`
    );
  };

  const handleToggleVerifyIncentive = (id: string) => {
    setIncentives((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? {
              ...inc,
              verifiedByRider: !inc.verifiedByRider,
              statusNote: !inc.verifiedByRider
                ? 'Verified by rider from app'
                : 'Check actual rider app offer.',
            }
          : inc
      )
    );
  };

  const handleDeleteIncentive = (id: string) => {
    setIncentives((prev) => prev.filter((inc) => inc.id !== id));
  };

  const handleLockRecommendedSavings = async () => {
    const saveAmount = selectedDayInsight.recommendedSavings;
    if (saveAmount <= 0) return;

    setLockingVault(true);
    try {
      if (supabase) {
        await supabase
          .from('riders')
          .update({
            vault_balance: vaultBalance + saveAmount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 'rider_blr_01');

        await supabase.from('transactions').insert({
          rider_id: 'rider_blr_01',
          category: 'vault_lock',
          amount: saveAmount,
          type: 'vault_topup',
          description: `Calendar Savings Lock (${selectedDayInsight.dateISO})`,
        });

        window.dispatchEvent(new CustomEvent('steadygig:refresh'));
        if (onVaultUpdated) onVaultUpdated();
      }
      setStatusMessage(
        `Saved ${formatINR(saveAmount)} from ${selectedDayInsight.dateISO} into your Emergency Reserve Vault.`
      );
    } finally {
      setLockingVault(false);
    }
  };

  const handleLogActualWeek = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWeek(true);
    const parsedDaily: Record<WeekdayName, number> = {
      Monday: Math.max(0, Number(newDailyMap.Monday) || 0),
      Tuesday: Math.max(0, Number(newDailyMap.Tuesday) || 0),
      Wednesday: Math.max(0, Number(newDailyMap.Wednesday) || 0),
      Thursday: Math.max(0, Number(newDailyMap.Thursday) || 0),
      Friday: Math.max(0, Number(newDailyMap.Friday) || 0),
      Saturday: Math.max(0, Number(newDailyMap.Saturday) || 0),
      Sunday: Math.max(0, Number(newDailyMap.Sunday) || 0),
    };

    const rec = buildCustomWeekRecord({
      weekLabel: newWeekLabel.trim() || `${newWeekStart} Week`,
      startDateISO: newWeekStart,
      dailyEarnings: parsedDaily,
      orderPayout: Math.max(0, Number(newOrderPayout) || 0),
      incentives: Math.max(0, Number(newIncentives) || 0),
      lateNightIncentive: Math.round((Number(newIncentives) || 0) * 0.25),
      weeklyIncentiveTarget: 2000,
      totalOrders: Math.max(1, Number(newOrders) || 120),
      singleRuns: Math.round((Number(newOrders) || 120) * 0.78),
      multiRuns: Math.round((Number(newOrders) || 120) * 0.22),
      dailyExpenseAverage: 240,
    });

    try {
      if (supabase) {
        const tier =
          rec.totalEarnings < 5000
            ? 'LEAN'
            : rec.totalEarnings >= 9000
            ? 'PEAK'
            : 'NORMAL';
        await supabase.from('payout_logs').insert({
          rider_id: 'rider_blr_01',
          week_label: rec.weekLabel,
          period: rec.weekKey,
          total_earnings: rec.totalEarnings,
          order_payout: rec.orderPayout,
          order_count: rec.totalOrders,
          incentives: rec.incentives,
          week_tier: tier,
          vault_delta: Math.round(rec.totalEarnings * 0.12),
          safe_daily_spend: Math.round((rec.totalEarnings * 0.75) / 7),
          daily_breakdown: rec.days.map((d) => ({
            day: d.day.slice(0, 3),
            amount: d.actualEarnings,
          })),
          kannada_summary: `${rec.weekLabel}: ₹${rec.totalEarnings}`,
        });
      }

      setInternalWeeks((prev) => [...prev, rec]);
      setShowLogWeekModal(false);
      setStatusMessage(
        `Recorded ${rec.weekLabel} (${formatINR(rec.totalEarnings)}). Calendar income predictions updated automatically.`
      );
    } finally {
      setSavingWeek(false);
    }
  };

  const jumpToToday = () => {
    const todayYear = Number(todayISO.slice(0, 4));
    const todayMonthIdx = Number(todayISO.slice(5, 7)) - 1;
    const todayDay = Number(todayISO.slice(8, 10));
    const foundIdx = BENGALURU_12_MONTH_PLAN.findIndex(
      (m) => m.year === todayYear && m.monthIndex === todayMonthIdx
    );
    if (foundIdx >= 0) {
      openMonthOrDayDetails(foundIdx, todayDay);
    } else {
      openMonthOrDayDetails(0, 20);
    }
  };

  const todayDisplayLabel = useMemo(() => {
    const [y, m, d] = todayISO.split('-').map(Number);
    if (!y || !m || !d) return 'Nov 20, 2026';
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [todayISO]);

  const lowIncomeMonthsCount = BENGALURU_12_MONTH_PLAN.filter((m) =>
    m.weeks.every((w) => w.demandColor !== 'GREEN')
  ).length;

  /**
   * Renders a single Month Card inside the Rectangular Poster Calendar.
   * Hovering the card triggers a smooth motion highlight; clicking it opens month details;
   * hovering any date cell shows an instant dark popover explaining why the date is colored.
   */
  const renderPosterMonthCard = (
    month: MonthCalendarPlan,
    monthIdx: number,
    colIndexInRow: number
  ) => {
    const totalDays = getDaysInMonth(month.year, month.monthIndex);
    const startOffset = getFirstWeekdayOfMonth(month.year, month.monthIndex);
    const isActive = detailsOpen && monthIdx === activeMonthIdx;
    const monthTitle = month.monthName.split(' ')[0].toUpperCase();
    const isTodayMonth = todayISO.startsWith(month.id);
    const monthActual = getMonthActualEarningsSummary(month.id, historicalWeeks);

    return (
      <motion.div
        key={month.id}
        whileHover={{ y: -4, scale: 1.015 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => openMonthOrDayDetails(monthIdx)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openMonthOrDayDetails(monthIdx);
          }
        }}
        className={`relative cursor-pointer rounded-lg sm:rounded-xl border bg-white p-1.5 sm:p-3.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] ${
          isActive
            ? 'border-[#047857] ring-2 ring-[#047857]/20 shadow-md'
            : monthActual
            ? 'border-emerald-300 shadow-sm hover:border-[#047857] hover:shadow-md'
            : isTodayMonth
            ? 'border-emerald-300 shadow-sm hover:border-[#047857] hover:shadow-md'
            : 'border-slate-200 hover:border-emerald-400 hover:shadow-md'
        }`}
      >
        {/* Month Header */}
        <div className="mb-1 sm:mb-2 flex items-center justify-between gap-1 border-b border-slate-100 pb-1 sm:pb-1.5">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="sm:hidden text-[10px] font-extrabold tracking-tight text-[#3B6B9B] truncate">
              {monthTitle.slice(0, 3)} &apos;{String(month.year).slice(2)}
            </span>
            <span className="hidden sm:inline text-sm font-extrabold tracking-wide text-[#3B6B9B]">
              {monthTitle} {month.year}
            </span>
            {isTodayMonth && (
              <span className="hidden sm:inline text-[10px] font-bold text-[#047857]">
                · Today
              </span>
            )}
          </div>
          {monthActual ? (
            <>
              <span className="sm:hidden rounded bg-emerald-50 px-1 py-0.5 font-mono text-[8px] font-bold text-[#047857] tabular-nums shrink-0">
                {formatCompactINR(monthActual.totalEarned)}
              </span>
              <span className="hidden sm:inline-flex items-center rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#047857] tabular-nums shrink-0">
                Earned {formatINR(monthActual.totalEarned)}
              </span>
            </>
          ) : (
            <span className="hidden sm:inline font-mono text-[10px] text-slate-500 tabular-nums shrink-0">
              {month.rainfallNormalMm}mm
            </span>
          )}
        </div>

        {/* SUN MON TUE WED THU FRI SAT */}
        <div className="grid grid-cols-7 gap-0 sm:gap-1 text-center text-[8px] sm:text-[10px] font-bold tracking-tight sm:tracking-wider">
          {WEEKDAY_HEADERS.map((wd, wIdx) => (
            <span
              key={wd}
              className={wIdx === 0 ? 'text-emerald-700' : 'text-slate-600'}
            >
              <span className="sm:hidden">{wd[0]}</span>
              <span className="hidden sm:inline">{wd}</span>
            </span>
          ))}
        </div>

        {/* Dates Matrix */}
        <div className="mt-1 sm:mt-1.5 grid grid-cols-7 gap-[1px] sm:gap-1 text-center">
          {Array.from({ length: startOffset }).map((_, emptyIdx) => (
            <span key={`empty-${emptyIdx}`} className="h-[22px] sm:h-10" />
          ))}

          {Array.from({ length: totalDays }).map((_, i) => {
            const dayNum = i + 1;
            const insight = buildDayInsight({
              month,
              dayNumber: dayNum,
              festivals,
              incentives,
              historicalWeeks,
            });
            const isToday = insight.dateISO === todayISO;
            const isPicked =
              detailsOpen &&
              monthIdx === activeMonthIdx &&
              dayNum === clampedSelectedDay;
            const isHovered =
              hoveredDay?.month.id === month.id &&
              hoveredDay?.insight.dayNumber === dayNum;
            const hasEarned = insight.actualEarned !== null;

            // Smart horizontal alignment for 4-column desktop grid
            const colHint: 'left' | 'center' | 'right' =
              colIndexInRow === 0
                ? 'left'
                : colIndexInRow === 3
                ? 'right'
                : 'center';

            return (
              <div
                key={`${month.id}-${dayNum}`}
                className="relative"
                onMouseEnter={() =>
                  setHoveredDay({ month, insight, colHint })
                }
                onMouseLeave={() =>
                  setHoveredDay((prev) =>
                    prev?.month.id === month.id &&
                    prev.insight.dayNumber === dayNum
                      ? null
                      : prev
                  )
                }
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMonthOrDayDetails(monthIdx, dayNum);
                  }}
                  aria-label={`${month.monthName} ${dayNum}${
                    hasEarned ? ` (Earned ₹${insight.actualEarned})` : ''
                  }${isToday ? ' (Today)' : ''}`}
                  className={`relative flex h-[22px] sm:h-10 w-full flex-col items-center justify-center rounded-[3px] sm:rounded text-[9px] sm:text-[11px] font-sans sm:font-mono font-semibold leading-none tracking-tighter sm:tracking-normal tabular-nums transition-colors ${
                    isToday
                      ? 'bg-[#047857] text-white ring-1 sm:ring-2 ring-[#047857] sm:ring-offset-1 shadow-sm'
                      : isPicked
                      ? 'bg-slate-900 text-white'
                      : hasEarned
                      ? 'bg-emerald-50 text-slate-900 ring-1 ring-[#047857]/80'
                      : getDemandSurfaceClasses(
                          insight.demandColor,
                          insight.hasFestival
                        )
                  } hover:ring-1 hover:ring-slate-900`}
                >
                  <span>{dayNum}</span>

                  {/* Earned ₹ shown right on desktop date cells */}
                  {hasEarned && insight.actualEarned !== null && (
                    <span
                      className={`hidden sm:block mt-0.5 font-mono text-[8px] font-bold leading-none tabular-nums ${
                        isToday || isPicked ? 'text-emerald-200' : 'text-[#047857]'
                      }`}
                    >
                      {formatCompactINR(insight.actualEarned)}
                    </span>
                  )}

                  {/* Bottom Demand Color Bar + Separate Purple & Blue Indicators */}
                  <span className="mt-[1px] sm:mt-0.5 flex items-center gap-[1px] sm:gap-0.5">
                    <span
                      className="h-[2px] sm:h-[3px] w-1.5 sm:w-2.5 rounded-full"
                      style={{
                        backgroundColor: hasEarned
                          ? '#047857'
                          : CALENDAR_COLORS[insight.demandColor],
                      }}
                    />
                    {insight.hasFestival && (
                      <span
                        className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full"
                        style={{ backgroundColor: CALENDAR_COLORS.PURPLE }}
                      />
                    )}
                    {insight.hasWeatherAlert && (
                      <span
                        className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full"
                        style={{ backgroundColor: CALENDAR_COLORS.BLUE }}
                      />
                    )}
                  </span>
                </button>

                {/* Instant Rich Hover Tooltip (Desktop) Explaining Actual Earned OR Demand/Festival/Weather */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.14 }}
                      className={`pointer-events-none hidden sm:block absolute bottom-full z-40 mb-2 w-72 rounded-xl border border-slate-700 bg-[#0F172A] p-3 text-left text-xs text-white shadow-xl ${
                        colHint === 'left'
                          ? 'left-0'
                          : colHint === 'right'
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
                        <span className="font-semibold text-white">
                          {isToday ? 'TODAY · ' : ''}
                          {insight.weekdayName.slice(0, 3)}, {month.monthName.split(' ')[0]}{' '}
                          {dayNum}, {month.year}
                        </span>
                        <span className="font-mono text-[10px] text-slate-300">
                          {insight.weekSlot.label}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        {/* Actual Earnings block when verified from driver screenshot */}
                        {insight.actualEarned !== null && (
                          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/70 px-2.5 py-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                                Actual Earned ({insight.actualSource === 'screenshot' ? 'Driver Photo' : 'Logged'})
                              </span>
                              <span className="font-mono text-sm font-bold text-emerald-200 tabular-nums">
                                {formatINR(insight.actualEarned)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] leading-snug text-emerald-100/90">
                              {insight.actualSingleRuns !== null && insight.actualMultiRuns !== null
                                ? `${insight.actualSingleRuns} Single · ${insight.actualMultiRuns} Multi${
                                    insight.actualExcludedOrders
                                      ? ` · ${insight.actualExcludedOrders} Excluded`
                                      : ''
                                  }`
                                : `${insight.actualCompletedOrders ?? 0} orders`}
                              {insight.weekEarnedSummary
                                ? ` · Week: ${formatINR(insight.weekEarnedSummary.totalEarnings)}`
                                : ''}
                            </p>
                          </div>
                        )}

                        {/* Demand color explanation */}
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-1 h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{
                              backgroundColor: CALENDAR_COLORS[insight.demandColor],
                            }}
                          />
                          <div>
                            <p className="font-semibold text-slate-100">
                              {insight.demandLevel} Expected Demand
                            </p>
                            <p className="text-[11px] leading-snug text-slate-300">
                              {insight.weekSlot.summary}
                            </p>
                          </div>
                        </div>

                        {/* Purple Festival explanation */}
                        {insight.festivals.length > 0 && (
                          <div className="flex items-start gap-2 rounded-lg bg-purple-950/60 px-2 py-1.5">
                            <span
                              className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: CALENDAR_COLORS.PURPLE }}
                            />
                            <div>
                              <p className="font-semibold text-purple-200">
                                Festival: {insight.festivals.map((f) => f.name).join(', ')}
                              </p>
                              <p className="text-[11px] leading-snug text-purple-100/80">
                                {insight.festivals[0].demandNote}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Blue Weather alert explanation */}
                        {insight.hasWeatherAlert && (
                          <div className="flex items-start gap-2 rounded-lg bg-blue-950/60 px-2 py-1.5">
                            <span
                              className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: CALENDAR_COLORS.BLUE }}
                            />
                            <div>
                              <p className="font-semibold text-blue-200">
                                Weather Alert ({insight.rainfallNormalMm} mm normal)
                              </p>
                              <p className="text-[11px] leading-snug text-blue-100/80">
                                {insight.rainfallRisk}
                              </p>
                            </div>
                          </div>
                        )}

                        <p className="pt-1 text-[10px] text-slate-400">
                          Click date for full order payout, incentives &amp; savings →
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Status Toast Banner */}
      {statusMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label="Dismiss notice"
            className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* RECTANGULAR YEAR CALENDAR (OCT 2026 – SEP 2027 · 4/ROW DESKTOP, 3/ROW PHONE) */}
      {/* ==================================================================== */}
      <section className="rounded-xl sm:rounded-2xl border border-slate-200 bg-[#FAF9F5] p-2.5 sm:p-7 shadow-sm">
        {/* Top Banner: Years 2026 – 2027 + Today Jump + Actions */}
        <div className="space-y-2.5 sm:space-y-4 border-b border-slate-200/80 pb-3 sm:pb-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <h1 className="text-2xl font-extrabold tracking-tight text-[#3B6B9B] sm:text-5xl">
                  2026 – 2027
                </h1>
                <span className="text-xs sm:text-sm font-semibold text-slate-700">
                  Bengaluru Delivery Calendar · Oct 2026 – Sep 2027
                </span>
              </div>
              <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-600">
                <span className="sm:hidden">
                  Tap highlighted months or dates for actual driver earnings.
                </span>
                <span className="hidden sm:inline">
                  Hover any month or date to see actual photo earnings, festival &amp; demand details · Click any date to inspect orders &amp; incentives.
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={jumpToToday}
                className="inline-flex min-h-[34px] sm:min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                <span className="h-2 w-2 rounded-full bg-[#047857]" />
                <span>Today: {todayDisplayLabel}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onRequestUploadScreenshot
                    ? onRequestUploadScreenshot()
                    : setShowLogWeekModal(true)
                }
                className="inline-flex min-h-[34px] sm:min-h-[38px] items-center gap-1.5 rounded-lg bg-[#047857] px-2.5 sm:px-3.5 py-1 text-[11px] sm:text-xs font-semibold text-white transition-colors hover:bg-[#065F46] whitespace-nowrap shrink-0"
              >
                {onRequestUploadScreenshot ? (
                  <Upload className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>
                  {onRequestUploadScreenshot ? 'Upload Screenshot' : 'Record Earnings'}
                </span>
              </button>
            </div>
          </div>

          {/* Verified Driver Screenshot Earnings Strip */}
          <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
              <span className="font-semibold text-slate-700">
                Actual Driver Earnings Recorded:
              </span>
              <span className="font-mono text-sm sm:text-base font-bold text-[#047857] tabular-nums">
                {formatINR(totalRecordedSummary.totalEarnings)}
              </span>
              <span className="text-[11px] text-slate-500">
                {formatINR(totalRecordedSummary.orderPayout)} payout +{' '}
                {formatINR(totalRecordedSummary.incentives)} incentives ·{' '}
                {totalRecordedSummary.totalOrders} orders ({historicalWeeks.length} wks)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {historicalWeeks.map((wk) => {
                const targetMonthId = wk.startDateISO.slice(0, 7);
                const mIdx = BENGALURU_12_MONTH_PLAN.findIndex(
                  (m) => m.id === targetMonthId
                );
                const startDay = Number(wk.startDateISO.slice(8, 10)) || 1;
                return (
                  <button
                    key={wk.id}
                    type="button"
                    onClick={() => {
                      if (mIdx >= 0) {
                        openMonthOrDayDetails(mIdx, startDay);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 text-[11px] font-medium text-emerald-900 transition-colors hover:bg-emerald-100 whitespace-nowrap"
                  >
                    <span>{wk.weekLabel}:</span>
                    <span className="font-mono font-bold text-[#047857] tabular-nums">
                      {formatINR(wk.totalEarnings)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exact 5-Color + Earned + Today Legend */}
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-5 gap-y-1.5 text-[10px] sm:text-xs">
            <div className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-sm shrink-0"
                style={{ backgroundColor: CALENDAR_COLORS.RED }}
              />
              <span className="font-medium text-slate-800">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-sm shrink-0"
                style={{ backgroundColor: CALENDAR_COLORS.YELLOW }}
              />
              <span className="font-medium text-slate-800">Medium</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-sm shrink-0"
                style={{ backgroundColor: CALENDAR_COLORS.GREEN }}
              />
              <span className="font-medium text-slate-800">High</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full shrink-0"
                style={{ backgroundColor: CALENDAR_COLORS.PURPLE }}
              />
              <span className="font-medium text-slate-800">Festival</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full shrink-0"
                style={{ backgroundColor: CALENDAR_COLORS.BLUE }}
              />
              <span className="font-medium text-slate-800">Weather Alert</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-sm border border-[#047857] bg-emerald-50 shrink-0" />
              <span className="font-semibold text-[#047857]">Earned ₹ (Photos)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-sm bg-[#047857] shrink-0" />
              <span className="font-semibold text-[#047857]">Today</span>
            </div>
          </div>
        </div>

        {/* Compact Multi-Month Grid: 3 in a row on Phone (all 12 fit cleanly), 4 in a row on Desktop */}
        <div className="mt-3 sm:mt-5">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3 lg:grid-cols-4 lg:gap-4">
            {BENGALURU_12_MONTH_PLAN.map((month, idx) =>
              renderPosterMonthCard(month, idx, idx % 4)
            )}
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* EXPANDED MONTH & DAY DETAILS PANEL (REVEALED ON PRESS / CLICK)       */}
      {/* ==================================================================== */}
      <div ref={detailSectionRef}>
        <AnimatePresence mode="wait">
          {detailsOpen && (
            <motion.section
              key={activeMonth.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start"
            >
              {/* Left 7 Columns: Active Month Calendar + W1–W5 Breakdown */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={activeMonthIdx === 0}
                      onClick={() => openMonthOrDayDetails(Math.max(0, activeMonthIdx - 1))}
                      aria-label="Previous month"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <h2 className="text-lg font-bold tracking-tight text-[#3B6B9B]">
                        {activeMonth.shortMonth}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {activeMonth.season} · IMD Normal Rainfall:{' '}
                        {activeMonth.rainfallNormalMm} mm
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={activeMonthIdx === BENGALURU_12_MONTH_PLAN.length - 1}
                      onClick={() =>
                        openMonthOrDayDetails(
                          Math.min(
                            BENGALURU_12_MONTH_PLAN.length - 1,
                            activeMonthIdx + 1
                          )
                        )
                      }
                      aria-label="Next month"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailsOpen(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Hide Details</span>
                  </button>
                </div>

                {/* Actual Earned Month Banner when screenshots/logs exist */}
                {activeMonthActual && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs">
                    <div>
                      <span className="font-semibold text-emerald-950">
                        Actual Earned in {activeMonth.monthName}:
                      </span>{' '}
                      <span className="font-mono text-sm font-bold text-[#047857] tabular-nums">
                        {formatINR(activeMonthActual.totalEarned)}
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-900">
                      {formatINR(activeMonthActual.orderPayout)} payout +{' '}
                      {formatINR(activeMonthActual.incentives)} incentives ·{' '}
                      {activeMonthActual.totalOrders} orders (
                      {activeMonthActual.singleRuns} single +{' '}
                      {activeMonthActual.multiRuns} multi)
                    </span>
                  </div>
                )}

                {/* Week Range Selector W1..W5 */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedWeekFilter(null)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedWeekFilter === null
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Weeks
                  </button>
                  {activeMonth.weeks.map((wk) => (
                    <button
                      key={wk.weekNumber}
                      type="button"
                      onClick={() => {
                        setSelectedWeekFilter(
                          selectedWeekFilter === wk.weekNumber
                            ? null
                            : wk.weekNumber
                        );
                        setSelectedDayNum(wk.startDay);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        selectedWeekFilter === wk.weekNumber
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-xs shrink-0"
                        style={{
                          backgroundColor: CALENDAR_COLORS[wk.demandColor],
                        }}
                      />
                      <span>{wk.label}</span>
                      {wk.hasFestival && (
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: CALENDAR_COLORS.PURPLE }}
                        />
                      )}
                      {wk.hasWeatherAlert && (
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: CALENDAR_COLORS.BLUE }}
                        />
                      )}
                    </button>
                  ))}
                </div>

                {/* Large Month Day Grid */}
                <div className="mt-4">
                  <div className="grid grid-cols-7 gap-1.5 border-b border-slate-200 pb-2 text-center text-xs font-bold tracking-wider">
                    {WEEKDAY_HEADERS.map((wd, idx) => (
                      <div
                        key={wd}
                        className={idx === 0 ? 'text-emerald-700' : 'text-slate-700'}
                      >
                        {wd}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 grid grid-cols-7 gap-1.5">
                    {Array.from({ length: firstWeekday }).map((_, emptyIdx) => (
                      <div key={`pad-${emptyIdx}`} className="min-h-[64px]" />
                    ))}

                    {activeMonthInsights.map((insight) => {
                      const isToday = insight.dateISO === todayISO;
                      const isSelected = insight.dayNumber === clampedSelectedDay;
                      const dimmed =
                        selectedWeekFilter !== null &&
                        insight.weekSlot.weekNumber !== selectedWeekFilter;

                      return (
                        <button
                          key={insight.dateISO}
                          type="button"
                          onClick={() => setSelectedDayNum(insight.dayNumber)}
                          className={`flex min-h-[64px] flex-col justify-between rounded-lg border p-2 text-left transition-all ${
                            isToday
                              ? 'border-[#047857] bg-emerald-50 ring-2 ring-[#047857]/30'
                              : isSelected
                              ? 'border-slate-900 ring-2 ring-slate-900/15 bg-white'
                              : getLargeDaySurfaceClasses(insight.demandColor)
                          } ${dimmed ? 'opacity-35' : 'opacity-100 hover:border-slate-400'}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                              {insight.dayNumber}
                              {isToday && (
                                <span className="ml-1 font-sans text-[10px] font-bold text-[#047857]">
                                  Today
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              {insight.hasFestival && (
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: CALENDAR_COLORS.PURPLE,
                                  }}
                                />
                              )}
                              {insight.hasWeatherAlert && (
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: CALENDAR_COLORS.BLUE,
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          <div className="mt-1 space-y-0.5">
                            {insight.actualEarned !== null && (
                              <p className="font-mono text-[11px] font-bold text-[#047857] tabular-nums">
                                {formatINR(insight.actualEarned)}
                              </p>
                            )}
                            {insight.festivals.length > 0 && (
                              <p className="truncate text-[10px] font-semibold text-purple-800">
                                {insight.festivals[0].name}
                              </p>
                            )}
                            <div className="flex items-center gap-1">
                              <span
                                className="h-1.5 w-3 rounded-xs shrink-0"
                                style={{
                                  backgroundColor:
                                    CALENDAR_COLORS[insight.demandColor],
                                }}
                              />
                              <span className="truncate text-[10px] font-medium text-slate-600">
                                {insight.demandLevel}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Driver Alert + Weekly W1–W5 Breakdown */}
                <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">
                      Driver alert:{' '}
                    </span>
                    {activeMonth.driverAlert}
                  </div>

                  <div className="space-y-1.5">
                    {activeMonth.weeks.map((wk) => (
                      <button
                        key={wk.weekNumber}
                        type="button"
                        onClick={() => {
                          setSelectedWeekFilter(
                            selectedWeekFilter === wk.weekNumber
                              ? null
                              : wk.weekNumber
                          );
                          setSelectedDayNum(wk.startDay);
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          selectedWeekFilter === wk.weekNumber
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-xs shrink-0"
                            style={{
                              backgroundColor: CALENDAR_COLORS[wk.demandColor],
                            }}
                          />
                          <span className="font-mono font-semibold text-slate-900 shrink-0">
                            {wk.label}
                          </span>
                          <span className="truncate text-slate-600">
                            {wk.summary}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {wk.hasFestival && (
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: CALENDAR_COLORS.PURPLE }}
                            >
                              Festival
                            </span>
                          )}
                          {wk.hasWeatherAlert && (
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: CALENDAR_COLORS.BLUE }}
                            >
                              Weather
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Selected Date 9-Point Inspector */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {selectedDayInsight.weekSlot.label} ·{' '}
                      {selectedDayInsight.weekdayName}
                    </p>
                    <h2 className="mt-0.5 text-xl font-bold text-slate-900">
                      {activeMonth.monthName.split(' ')[0]}{' '}
                      {selectedDayInsight.dayNumber}, {activeMonth.year}
                      {selectedDayInsight.dateISO === todayISO && (
                        <span className="ml-2 text-xs font-bold text-[#047857]">
                          · Today
                        </span>
                      )}
                    </h2>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-xs shrink-0"
                      style={{
                        backgroundColor:
                          CALENDAR_COLORS[selectedDayInsight.demandColor],
                      }}
                    />
                    <span className="text-xs font-semibold text-slate-900">
                      {selectedDayInsight.demandLevel} Demand
                    </span>
                  </div>
                </div>

                {/* Actual Screenshot Earnings Card (when recorded for selected date) */}
                {selectedDayInsight.actualEarned !== null && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/75 p-4 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold uppercase tracking-wide text-emerald-900">
                        Actual Earned (Driver Screenshot)
                      </span>
                      <span className="font-mono text-xl font-bold text-[#047857] tabular-nums">
                        {formatINR(selectedDayInsight.actualEarned)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-emerald-950">
                      {selectedDayInsight.actualSingleRuns ?? 0} Single Runs ·{' '}
                      {selectedDayInsight.actualMultiRuns ?? 0} Multi Runs
                      {selectedDayInsight.actualExcludedOrders
                        ? ` · ${selectedDayInsight.actualExcludedOrders} Excluded`
                        : ''}
                      {selectedDayInsight.actualOrderPayout !== null &&
                      selectedDayInsight.actualIncentives !== null
                        ? ` (${formatINR(selectedDayInsight.actualOrderPayout)} payout + ${formatINR(selectedDayInsight.actualIncentives)} incentives share)`
                        : ''}
                    </p>
                    {selectedDayInsight.actualDetailNote && (
                      <p className="mt-1 text-[11px] text-emerald-900/90">
                        {selectedDayInsight.actualDetailNote}
                      </p>
                    )}
                    {selectedDayInsight.weekEarnedSummary && (
                      <div className="mt-2.5 border-t border-emerald-200/80 pt-2 text-[11px] text-emerald-950">
                        <strong>
                          {selectedDayInsight.weekEarnedSummary.weekLabel}:
                        </strong>{' '}
                        {formatINR(
                          selectedDayInsight.weekEarnedSummary.totalEarnings
                        )}{' '}
                        ({formatINR(selectedDayInsight.weekEarnedSummary.orderPayout)}{' '}
                        order payout +{' '}
                        {formatINR(selectedDayInsight.weekEarnedSummary.incentives)}{' '}
                        incentives ·{' '}
                        {formatINR(
                          selectedDayInsight.weekEarnedSummary.lateNightIncentive
                        )}{' '}
                        late-night bonus ·{' '}
                        {selectedDayInsight.weekEarnedSummary.totalOrders} orders)
                      </div>
                    )}
                  </div>
                )}

                {/* Formatted Notification Box */}
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                  <p className="font-semibold text-slate-900">
                    {activeMonth.monthName.split(' ')[0]}{' '}
                    {selectedDayInsight.dayNumber}
                    {selectedDayInsight.festivals.length > 0
                      ? ` – ${selectedDayInsight.festivals
                          .map((f) => f.name)
                          .join(', ')}`
                      : ` – ${selectedDayInsight.weekdayName} Shift Plan`}
                  </p>
                  <p className="mt-1.5">
                    <strong>Expected demand (Estimated):</strong>{' '}
                    {selectedDayInsight.demandLevel}
                    {selectedDayInsight.hasFestival
                      ? ' (Festival / special occasion)'
                      : ''}
                  </p>
                  <p>
                    <strong>Weather:</strong>{' '}
                    {selectedDayInsight.weatherCondition} · Check live weather
                    forecast
                  </p>
                  <p>
                    <strong>Peak hours:</strong>{' '}
                    {selectedDayInsight.peakDeliveryHours.join(', ')}
                  </p>
                  <p>
                    <strong>Incentives:</strong>{' '}
                    {selectedDayInsight.verifiedIncentives.length > 0
                      ? `${selectedDayInsight.verifiedIncentives.length} verified rider offer(s) active`
                      : 'Check your delivery partner app'}
                  </p>
                  <p className="mt-1 text-emerald-800">
                    <strong>Recommendation:</strong>{' '}
                    {selectedDayInsight.recommendation}
                  </p>
                </div>

                <dl className="mt-4 divide-y divide-slate-100 text-xs">
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">1. Expected Demand</dt>
                    <dd className="text-right font-semibold text-slate-900">
                      {selectedDayInsight.demandLevel} (Estimated)
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">
                      2. Festival / Special Event
                    </dt>
                    <dd className="text-right font-medium text-slate-900">
                      {selectedDayInsight.festivals.length > 0 ? (
                        <span style={{ color: CALENDAR_COLORS.PURPLE }}>
                          {selectedDayInsight.festivals
                            .map((f) => f.name)
                            .join(', ')}
                        </span>
                      ) : (
                        'None scheduled'
                      )}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">3. Weather Condition</dt>
                    <dd className="text-right text-slate-800">
                      {selectedDayInsight.weatherCondition}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">
                      4. Rainfall Risk (IMD Normal)
                    </dt>
                    <dd
                      className="text-right font-medium"
                      style={{ color: CALENDAR_COLORS.BLUE }}
                    >
                      {selectedDayInsight.rainfallRisk}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">5. Peak Delivery Hours</dt>
                    <dd className="text-right text-slate-800">
                      {selectedDayInsight.peakDeliveryHours.join(' · ')}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">6. Platform Incentives</dt>
                    <dd className="text-right text-slate-800">
                      {selectedDayInsight.verifiedIncentives.length > 0 ? (
                        selectedDayInsight.verifiedIncentives.map((inc) => (
                          <div
                            key={inc.id}
                            className="font-medium text-emerald-700"
                          >
                            {inc.platformName}: {inc.timeWindow}{' '}
                            {inc.bonusAmount
                              ? `(+${formatINR(inc.bonusAmount)})`
                              : ''}
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500">
                          Not verified — check your partner app
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">
                      {selectedDayInsight.actualEarned !== null
                        ? '7. Actual Earned (Screenshot)'
                        : '7. Est. Income Opportunity'}
                    </dt>
                    <dd className="text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {selectedDayInsight.actualEarned !== null ? (
                        <>
                          <span className="text-[#047857]">
                            {formatINR(selectedDayInsight.actualEarned)}
                          </span>
                          <span className="block font-sans text-[11px] font-normal text-slate-500">
                            Recorded from driver earnings screenshot
                          </span>
                        </>
                      ) : (
                        <>
                          {formatINR(selectedDayInsight.estimatedIncomeLow)} –{' '}
                          {formatINR(selectedDayInsight.estimatedIncomeHigh)}
                          <span className="block font-sans text-[11px] font-normal text-slate-500">
                            Based on your {historicalWeeks.length}-week actual
                            baseline
                          </span>
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">8. Recommended Savings</dt>
                    <dd className="text-right font-mono font-bold text-emerald-700 tabular-nums">
                      {formatINR(selectedDayInsight.recommendedSavings)}
                      <span className="block font-sans text-[11px] font-normal text-slate-500">
                        After ~
                        {formatINR(
                          selectedDayInsight.estimatedFuelAndMaintenance
                        )}{' '}
                        fuel/maint
                      </span>
                    </dd>
                  </div>

                  {selectedDayInsight.safetyWarning && (
                    <div className="py-2.5">
                      <dt className="flex items-center gap-1.5 font-semibold text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>9. Safety Warning</span>
                      </dt>
                      <dd className="mt-1 text-amber-900">
                        {selectedDayInsight.safetyWarning}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setPlannerTab('incentives')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Edit Incentives
                  </button>
                  <button
                    type="button"
                    disabled={
                      lockingVault ||
                      selectedDayInsight.recommendedSavings <= 0
                    }
                    onClick={handleLockRecommendedSavings}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#047857] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-50"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {lockingVault
                        ? 'Saving...'
                        : `Save ${formatINR(
                            selectedDayInsight.recommendedSavings
                          )} to Vault`}
                    </span>
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* ==================================================================== */}
      {/* CONNECTED PLANNING TOOLS (SMART PLANNER / INCENTIVES / WEATHER / DATES) */}
      {/* ==================================================================== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPlannerTab('planner')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                plannerTab === 'planner'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Smart Income Planner
            </button>
            <button
              type="button"
              onClick={() => setPlannerTab('incentives')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                plannerTab === 'incentives'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Platform Incentives ({incentives.length})
            </button>
            <button
              type="button"
              onClick={() => setPlannerTab('festivals')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                plannerTab === 'festivals'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Update Festival / Islamic Dates
            </button>
          </div>

          <span className="text-[11px] text-slate-500">
            Adaptive forecast: Bengaluru Calendar 2026–2027 · Rider Actuals (
            {historicalWeeks.length} wks)
          </span>
        </div>

        {/* TAB 1: SMART INCOME PLANNER */}
        {plannerTab === 'planner' && (
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs text-slate-500">
                    Actual Recorded Avg / Wk
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatINR(learnedBaseline.averageWeeklyEarnings)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Oct (₹3,678) &amp; Nov (₹10,712) actuals
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs text-slate-500">
                    Est. {activeMonth.monthName} Income
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
                    {formatINR(activeMonthPredictedEarnings)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Estimated from calendar + baseline
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs text-slate-500">
                    Est. Fuel &amp; Maintenance
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatINR(activeMonthFuelAndMaint)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {activeMonth.rainfallNormalMm >= 100
                      ? 'Includes monsoon repair buffer'
                      : 'Standard dry-season operating cost'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 text-xs">
                <p className="font-semibold text-slate-900">
                  Actual Recorded Weekly Payouts vs Estimated Demand
                </p>
                <div className="mt-3 divide-y divide-slate-100">
                  {historicalWeeks.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <span className="font-medium text-slate-900">
                          {w.weekLabel}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-slate-500">
                          {w.totalOrders} orders ({formatINR(w.orderPayout)}{' '}
                          payout + {formatINR(w.incentives)} incentives)
                        </span>
                      </div>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatINR(w.totalEarnings)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Weekly baseline rules: Mon–Tue lower/medium, Wed–Thu medium,
                  Fri high evening, Sat–Sun very high potential. Daily peaks:
                  7–10 AM, 12–2 PM, 5–7 PM, 7–10 PM.
                </p>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-5">
              <div className="rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Adaptive Weekday Pattern ({learnedBaseline.weekCount} wks)
                  </h3>
                  <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                    Next wk: {formatINR(learnedBaseline.predictedNextWeekLow)}–
                    {formatINR(learnedBaseline.predictedNextWeekHigh)}
                  </span>
                </div>

                <div className="mt-3 divide-y divide-slate-100 text-xs">
                  {learnedBaseline.weekdayStats.map((stat) => (
                    <div
                      key={stat.day}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-slate-900">
                          {stat.shortDay}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-slate-500">{stat.patternLabel}</span>
                      </div>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                        {formatINR(stat.average)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
                <p className="font-semibold">
                  Slower-Month Readiness ({lowIncomeMonthsCount} slower months flagged)
                </p>
                <p className="mt-1 leading-relaxed">
                  February and monsoon months carry lower weekday demand or rain
                  delays. Shield ~{formatINR(activeMonthRecommendedSavings)} during
                  stronger weeks in {activeMonth.monthName} to stay ahead of bills.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EDITABLE PLATFORM INCENTIVES */}
        {plannerTab === 'incentives' && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Editable Platform Incentives
                </h3>
                <p className="text-xs text-slate-500">
                  SteadyGig never assumes or guarantees Zomato/Swiggy bonuses.
                  Add and verify actual offers from your rider app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIncentiveForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {showIncentiveForm ? 'Close Form' : 'Add Platform Offer'}
                </span>
              </button>
            </div>

            {showIncentiveForm && (
              <form
                onSubmit={handleAddIncentive}
                className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3"
              >
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Platform Name</span>
                  <input
                    type="text"
                    required
                    value={incPlatform}
                    onChange={(e) => setIncPlatform(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Applicable Date</span>
                  <input
                    type="date"
                    required
                    value={incDate}
                    onChange={(e) => setIncDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Start &amp; End Time</span>
                  <input
                    type="text"
                    required
                    value={incTime}
                    onChange={(e) => setIncTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Orders Required</span>
                  <input
                    type="number"
                    min={0}
                    value={incOrdersReq}
                    onChange={(e) => setIncOrdersReq(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Minimum Earnings Condition</span>
                  <input
                    type="text"
                    value={incMinEarn}
                    onChange={(e) => setIncMinEarn(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Bonus Amount (₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={incBonus}
                    onChange={(e) => setIncBonus(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Rain or Surge Bonus</span>
                  <input
                    type="text"
                    value={incRainSurge}
                    onChange={(e) => setIncRainSurge(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Eligibility Conditions</span>
                  <input
                    type="text"
                    value={incEligibility}
                    onChange={(e) => setIncEligibility(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Expiry Date</span>
                  <input
                    type="date"
                    value={incExpiry}
                    onChange={(e) => setIncExpiry(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900"
                  />
                </label>

                <div className="flex items-center justify-between pt-2 sm:col-span-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={incVerified}
                      onChange={(e) => setIncVerified(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-700"
                    />
                    <span>I verified this offer directly inside my rider app</span>
                  </label>

                  <button
                    type="submit"
                    className="rounded-lg bg-[#047857] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
                  >
                    Save Offer
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {incentives.map((inc) => (
                <div
                  key={inc.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {inc.platformName}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-slate-700">
                        {inc.applicableDate} ({inc.timeWindow})
                      </span>
                      <span className="text-slate-300">·</span>
                      <span
                        className={
                          inc.verifiedByRider
                            ? 'font-semibold text-emerald-700'
                            : 'font-medium text-amber-700'
                        }
                      >
                        {inc.verifiedByRider
                          ? 'Verified by rider'
                          : 'Unverified — Check rider app'}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      {inc.bonusAmount
                        ? `Bonus: ${formatINR(inc.bonusAmount)} · `
                        : ''}
                      {inc.ordersRequired ? `${inc.ordersRequired} orders · ` : ''}
                      {inc.minEarningsCondition} · Rain/Surge:{' '}
                      {inc.rainOrSurgeBonus}
                    </p>
                    <p className="text-slate-500">
                      Eligibility: {inc.eligibilityConditions} · Expires:{' '}
                      {inc.expiryDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleVerifyIncentive(inc.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {inc.verifiedByRider ? 'Mark Unverified' : 'Verify Offer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteIncentive(inc.id)}
                      aria-label="Remove incentive"
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: UPDATE FESTIVAL / ISLAMIC HOLIDAY DATES */}
        {plannerTab === 'festivals' && (
          <div className="mt-5 space-y-3">
            <p className="text-xs text-slate-600">
              Islamic lunar holidays (Ramzan Eid, Bakrid, Muharram) and regional
              festivals can be adjusted immediately once official dates or moon
              sightings are confirmed.
            </p>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {festivals.map((fest) => {
                const isEditing = editingFestivalId === fest.id;
                return (
                  <div
                    key={fest.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CALENDAR_COLORS.PURPLE }}
                      />
                      <span className="font-semibold text-slate-900">
                        {fest.name}
                      </span>
                      {fest.tentative && (
                        <span className="text-[11px] font-medium text-amber-700">
                          (Tentative / Moon sighting)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <input
                            type="date"
                            value={editingFestivalDate}
                            onChange={(e) =>
                              setEditingFestivalDate(e.target.value)
                            }
                            className="rounded border border-slate-200 px-2 py-1 font-mono text-xs text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveFestivalDate(fest.id)}
                            className="rounded bg-[#047857] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#065F46]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFestivalId(null)}
                            className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-slate-700">
                            {fest.dateISO}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFestivalId(fest.id);
                              setEditingFestivalDate(fest.dateISO);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Update Date</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Modal: Record Actual Rider Weekly Earnings */}
      {showLogWeekModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-actual-week-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-emerald-700" />
                <h3
                  id="log-actual-week-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Record Actual Weekly Earnings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLogWeekModal(false)}
                aria-label="Close modal"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleLogActualWeek} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Week Label</span>
                  <input
                    type="text"
                    required
                    value={newWeekLabel}
                    onChange={(e) => setNewWeekLabel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="font-medium">Week Start (Monday)</span>
                  <input
                    type="date"
                    required
                    value={newWeekStart}
                    onChange={(e) => setNewWeekStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {WEEKDAYS_ORDER.map((day) => (
                  <label key={day} className="text-xs text-slate-600">
                    <span>{day} (₹)</span>
                    <input
                      type="number"
                      min={0}
                      required
                      value={newDailyMap[day]}
                      onChange={(e) =>
                        setNewDailyMap((prev) => ({
                          ...prev,
                          [day]: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900 tabular-nums"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-slate-600">
                  <span>Order Payout (₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={newOrderPayout}
                    onChange={(e) => setNewOrderPayout(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span>Incentives (₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={newIncentives}
                    onChange={(e) => setNewIncentives(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span>Completed Orders</span>
                  <input
                    type="number"
                    min={1}
                    value={newOrders}
                    onChange={(e) => setNewOrders(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLogWeekModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWeek}
                  className="rounded-lg bg-[#047857] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-50"
                >
                  {savingWeek ? 'Saving...' : 'Save & Update Predictions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
