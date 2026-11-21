export type BandColorKey = 'RED' | 'YELLOW' | 'GREEN' | 'PURPLE';

export interface EarningsBands {
  redMax: number; // Below this => RED (default 500)
  yellowMax: number; // Below this => YELLOW (default 1000 => 500..999)
  greenMax: number; // Below this => GREEN (default 2000 => 1000..1999, >=2000 => PURPLE)
}

export const DEFAULT_EARNINGS_BANDS: EarningsBands = {
  redMax: 500,
  yellowMax: 1000,
  greenMax: 2000,
};

export type WeekdayName =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export const WEEKDAYS_ORDER: WeekdayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export type ExpectedDemandLevel = 'Low' | 'Moderate' | 'High' | 'Festive Peak';

export interface DailyRecordInput {
  dateISO: string;
  dateLabel: string;
  day: WeekdayName;
  actualEarnings: number;
  orderPayout: number;
  incentives: number;
  completedOrders: number;
  singleRuns: number;
  multiRuns: number;
  workExpenses: number;
  historicalReference: string;
  expectedDemand: ExpectedDemandLevel;
  demandReason: string;
  weatherCondition: string;
  verifiedIncentiveNote: string;
}

export interface DailyComputedRow extends DailyRecordInput {
  takeHomeEarnings: number;
  recommendedSavings: number;
  essentialShortfall: boolean;
  band: BandColorKey;
  bandLabel: string;
  recommendation: string;
}

export interface WeeklyEarningsRecord {
  id: string;
  weekKey: string; // e.g. '2026-10-19 to 2026-10-25'
  weekLabel: string;
  startDateISO: string;
  endDateISO: string;
  totalEarnings: number;
  orderPayout: number;
  incentives: number;
  lateNightIncentive: number;
  weeklyIncentiveTarget: number;
  missedIncentiveOpportunity: number;
  bonusExpiryDate: string;
  ordersNeededForNextTarget: number;
  targetCompleted: boolean;
  totalOrders: number;
  singleRuns: number;
  multiRuns: number;
  weeklyEssentialExpenses: number;
  days: DailyRecordInput[];
  source: 'screenshot' | 'supabase' | 'custom';
}

export interface WeeklySummaryMetrics {
  totalWeeklyEarnings: number;
  totalOrderPayout: number;
  totalIncentives: number;
  averageDailyEarnings: number;
  highestEarningDay: { day: WeekdayName; dateLabel: string; amount: number };
  lowestEarningDay: { day: WeekdayName; dateLabel: string; amount: number };
  totalExpenses: number;
  totalTakeHome: number;
  totalRecommendedSavings: number;
  baselineRatio: number;
  incomeStatus: 'LOW' | 'HIGH' | 'NORMAL';
  alertMessage: string | null;
  savingsBreakdown: {
    fromOrderPayouts: number;
    fromIncentives: number;
    surplusBonusSavings: number;
    essentialProtected: boolean;
  };
}

export interface LearnedPatternSummary {
  weekCount: number;
  averageWeeklyEarnings: number;
  averageDailyEarnings: number;
  predictedNextWeekLow: number;
  predictedNextWeekMid: number;
  predictedNextWeekHigh: number;
  weekdayStats: {
    day: WeekdayName;
    shortDay: string;
    observedValues: number[];
    average: number;
    min: number;
    max: number;
    patternLabel: string;
  }[];
  highIncomePeriods: string[];
  lowIncomePeriods: string[];
}

/**
 * Splits weekly order_payout, incentives, total_orders, single_runs, multi_runs
 * proportionally across the 7 days so daily numbers reconcile cleanly to exact weekly totals.
 */
function buildDailyBreakdown(params: {
  startDateISO: string;
  dailyTotals: Record<WeekdayName, number>;
  weeklyTotal: number;
  weeklyOrderPayout: number;
  weeklyIncentives: number;
  totalOrders: number;
  singleRuns: number;
  multiRuns: number;
  defaultDailyExpenses: Record<WeekdayName, number>;
  calendarMeta: Record<
    WeekdayName,
    {
      historicalReference: string;
      expectedDemand: ExpectedDemandLevel;
      demandReason: string;
      weatherCondition: string;
      verifiedIncentiveNote: string;
    }
  >;
}): DailyRecordInput[] {
  const start = new Date(`${params.startDateISO}T00:00:00Z`);
  let remainingPayout = params.weeklyOrderPayout;
  let remainingIncentives = params.weeklyIncentives;
  let remainingOrders = params.totalOrders;
  let remainingSingle = params.singleRuns;
  let remainingMulti = params.multiRuns;

  return WEEKDAYS_ORDER.map((day, idx) => {
    const dt = new Date(start.getTime() + idx * 86400000);
    const dateISO = dt.toISOString().slice(0, 10);
    const dateLabel = dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });

    const actualEarnings = params.dailyTotals[day];
    const isLast = idx === WEEKDAYS_ORDER.length - 1;
    const share = params.weeklyTotal > 0 ? actualEarnings / params.weeklyTotal : 1 / 7;

    let orderPayout = isLast
      ? remainingPayout
      : Math.min(actualEarnings, Math.round(params.weeklyOrderPayout * share));
    let incentives = isLast ? remainingIncentives : actualEarnings - orderPayout;

    // Keep incentives non-negative and reconciled
    if (!isLast && incentives < 0) {
      orderPayout = actualEarnings;
      incentives = 0;
    }
    if (isLast && orderPayout + incentives !== actualEarnings) {
      orderPayout = Math.max(0, actualEarnings - incentives);
    }

    remainingPayout -= orderPayout;
    remainingIncentives -= incentives;

    const completedOrders = isLast
      ? Math.max(0, remainingOrders)
      : Math.max(1, Math.round(params.totalOrders * share));
    remainingOrders -= completedOrders;

    const singleRuns = isLast
      ? Math.max(0, remainingSingle)
      : Math.min(completedOrders, Math.round(params.singleRuns * share));
    remainingSingle -= singleRuns;

    const multiRuns = isLast
      ? Math.max(0, remainingMulti)
      : Math.max(0, completedOrders - singleRuns);
    remainingMulti -= multiRuns;

    const meta = params.calendarMeta[day];

    return {
      dateISO,
      dateLabel,
      day,
      actualEarnings,
      orderPayout,
      incentives,
      completedOrders,
      singleRuns,
      multiRuns,
      workExpenses: params.defaultDailyExpenses[day],
      historicalReference: meta.historicalReference,
      expectedDemand: meta.expectedDemand,
      demandReason: meta.demandReason,
      weatherCondition: meta.weatherCondition,
      verifiedIncentiveNote: meta.verifiedIncentiveNote,
    };
  });
}

export const INITIAL_WEEKLY_RECORDS: WeeklyEarningsRecord[] = [
  {
    id: 'week-2026-10-19',
    weekKey: '2026-10-19 to 2026-10-25',
    weekLabel: 'Oct 19–25, 2026',
    startDateISO: '2026-10-19',
    endDateISO: '2026-10-25',
    totalEarnings: 3678,
    orderPayout: 2710,
    incentives: 968,
    lateNightIncentive: 300,
    weeklyIncentiveTarget: 2000,
    missedIncentiveOpportunity: 1032,
    bonusExpiryDate: 'Sun, 25 Oct · 11:59 PM',
    ordersNeededForNextTarget: 27,
    targetCompleted: false,
    totalOrders: 103,
    singleRuns: 84,
    multiRuns: 19,
    weeklyEssentialExpenses: 2200,
    source: 'screenshot',
    days: buildDailyBreakdown({
      startDateISO: '2026-10-19',
      dailyTotals: {
        Monday: 220,
        Tuesday: 250,
        Wednesday: 90,
        Thursday: 150,
        Friday: 270,
        Saturday: 1110,
        Sunday: 1588,
      },
      weeklyTotal: 3678,
      weeklyOrderPayout: 2710,
      weeklyIncentives: 968,
      totalOrders: 103,
      singleRuns: 84,
      multiRuns: 19,
      defaultDailyExpenses: {
        Monday: 90,
        Tuesday: 95,
        Wednesday: 60,
        Thursday: 80,
        Friday: 110,
        Saturday: 240,
        Sunday: 280,
      },
      calendarMeta: {
        Monday: {
          historicalReference: 'First recorded Monday (₹220)',
          expectedDemand: 'Moderate',
          demandReason: 'Regular weekday post-weekend cool-down',
          weatherCondition: '26°C · Light evening drizzle in HSR',
          verifiedIncentiveNote: 'Standard weekday base; late-night bonus eligible',
        },
        Tuesday: {
          historicalReference: 'First recorded Tuesday (₹250)',
          expectedDemand: 'Low',
          demandReason: 'Mid-week quiet lunch & dinner slots',
          weatherCondition: '25°C · Clear evening in Koramangala',
          verifiedIncentiveNote: 'No active rain surge',
        },
        Wednesday: {
          historicalReference: 'Lowest observed Oct day (₹90)',
          expectedDemand: 'Low',
          demandReason: 'Mid-week dip; low afternoon order volume',
          weatherCondition: '27°C · Dry evening',
          verifiedIncentiveNote: 'Only partial base payout logged',
        },
        Thursday: {
          historicalReference: 'First recorded Thursday (₹150)',
          expectedDemand: 'Moderate',
          demandReason: 'Pre-weekend evening pickup only',
          weatherCondition: '24°C · Cloudy late night',
          verifiedIncentiveNote: 'Late-night ₹300 weekly pool started',
        },
        Friday: {
          historicalReference: 'First recorded Friday (₹270)',
          expectedDemand: 'High',
          demandReason: 'Friday evening social orders (partial shift)',
          weatherCondition: '23°C · Moderate rain around Bellandur',
          verifiedIncentiveNote: 'Rain micro-incentive available 8–11 PM',
        },
        Saturday: {
          historicalReference: 'Strong weekend shift (₹1,110)',
          expectedDemand: 'High',
          demandReason: 'Saturday lunch + dinner rush in Bengaluru',
          weatherCondition: '25°C · Pleasant clear weather',
          verifiedIncentiveNote: 'Weekend milestone tier active',
        },
        Sunday: {
          historicalReference: 'Highest Oct shift (₹1,588)',
          expectedDemand: 'High',
          demandReason: 'Sunday family dinner peak + late-night orders',
          weatherCondition: '24°C · Light showers 7–9 PM',
          verifiedIncentiveNote: '₹300 late-night bonus unlocked; ₹1,032 target missed',
        },
      },
    }),
  },
  {
    id: 'week-2026-11-09',
    weekKey: '2026-11-09 to 2026-11-15',
    weekLabel: 'Nov 09–15, 2026',
    startDateISO: '2026-11-09',
    endDateISO: '2026-11-15',
    totalEarnings: 10712,
    orderPayout: 7660,
    incentives: 3052,
    lateNightIncentive: 585,
    weeklyIncentiveTarget: 2000,
    missedIncentiveOpportunity: 215,
    bonusExpiryDate: 'Sun, 15 Nov · 11:59 PM',
    ordersNeededForNextTarget: 0,
    targetCompleted: true,
    totalOrders: 308,
    singleRuns: 229,
    multiRuns: 79,
    weeklyEssentialExpenses: 2200,
    source: 'screenshot',
    days: buildDailyBreakdown({
      startDateISO: '2026-11-09',
      dailyTotals: {
        Monday: 1190,
        Tuesday: 1110,
        Wednesday: 1010,
        Thursday: 1080,
        Friday: 1110,
        Saturday: 1150,
        Sunday: 4062,
      },
      weeklyTotal: 10712,
      weeklyOrderPayout: 7660,
      weeklyIncentives: 3052,
      totalOrders: 308,
      singleRuns: 229,
      multiRuns: 79,
      defaultDailyExpenses: {
        Monday: 260,
        Tuesday: 250,
        Wednesday: 240,
        Thursday: 250,
        Friday: 260,
        Saturday: 280,
        Sunday: 420,
      },
      calendarMeta: {
        Monday: {
          historicalReference: 'Up 5.4× vs Oct Mon (₹220 → ₹1,190)',
          expectedDemand: 'High',
          demandReason: 'Post-festive November week + high multi-run density',
          weatherCondition: '22°C · Cool evening, clear roads',
          verifiedIncentiveNote: 'Multi-run batch booster active',
        },
        Tuesday: {
          historicalReference: 'Up 4.4× vs Oct Tue (₹250 → ₹1,110)',
          expectedDemand: 'Moderate',
          demandReason: 'Steady IT corridor dinner volume (HSR/Bellandur)',
          weatherCondition: '23°C · Clear evening',
          verifiedIncentiveNote: 'Daily consistency slab achieved',
        },
        Wednesday: {
          historicalReference: 'Up from ₹90 in Oct to ₹1,010 in Nov',
          expectedDemand: 'Moderate',
          demandReason: 'Stronger Nov mid-week shift; festive leftovers demand',
          weatherCondition: '22°C · Light mist late night',
          verifiedIncentiveNote: 'Late-night ₹585 weekly tier active',
        },
        Thursday: {
          historicalReference: 'Up 7.2× vs Oct Thu (₹150 → ₹1,080)',
          expectedDemand: 'High',
          demandReason: 'Pre-weekend corporate & residential orders',
          weatherCondition: '21°C · Cool & dry',
          verifiedIncentiveNote: 'Weekly ₹2,000 target pace on track',
        },
        Friday: {
          historicalReference: 'Consistent ₹1,110 Friday shift',
          expectedDemand: 'High',
          demandReason: 'Friday night Bengaluru dinner & group orders',
          weatherCondition: '22°C · Pleasant evening',
          verifiedIncentiveNote: 'Weekend surge multiplier unlocked',
        },
        Saturday: {
          historicalReference: 'Strong in both weeks (₹1,110 & ₹1,150)',
          expectedDemand: 'Festive Peak',
          demandReason: 'Weekend peak + Children’s Day weekend gatherings',
          weatherCondition: '23°C · Clear night',
          verifiedIncentiveNote: 'Weekly ₹2,000 target reached early',
        },
        Sunday: {
          historicalReference: 'Highest ever day (₹4,062 vs ₹1,588 Oct)',
          expectedDemand: 'Festive Peak',
          demandReason: 'Sunday super-peak + late-night bonus + multi-runs',
          weatherCondition: '21°C · Cool breeze, zero rain disruption',
          verifiedIncentiveNote: '₹2,000 target completed + ₹585 late-night bonus',
        },
      },
    }),
  },
];

export function classifyEarningsBand(
  amount: number,
  bands: EarningsBands
): { band: BandColorKey; label: string; rangeText: string } {
  if (amount < bands.redMax) {
    return {
      band: 'RED',
      label: 'Low Band',
      rangeText: `Below ₹${bands.redMax}`,
    };
  }
  if (amount < bands.yellowMax) {
    return {
      band: 'YELLOW',
      label: 'Moderate Band',
      rangeText: `₹${bands.redMax}–₹${bands.yellowMax - 1}`,
    };
  }
  if (amount < bands.greenMax) {
    return {
      band: 'GREEN',
      label: 'Strong Band',
      rangeText: `₹${bands.yellowMax}–₹${bands.greenMax - 1}`,
    };
  }
  return {
    band: 'PURPLE',
    label: 'Peak Band',
    rangeText: `₹${bands.greenMax}+`,
  };
}

export function computeLearnedPattern(
  weeks: WeeklyEarningsRecord[]
): LearnedPatternSummary {
  const safeWeeks = weeks.length > 0 ? weeks : INITIAL_WEEKLY_RECORDS;
  const totalWeeklySum = safeWeeks.reduce((acc, w) => acc + w.totalEarnings, 0);
  const averageWeeklyEarnings = Math.round(totalWeeklySum / safeWeeks.length);
  const averageDailyEarnings = Math.round(averageWeeklyEarnings / 7);

  const weekdayStats = WEEKDAYS_ORDER.map((day) => {
    const observedValues = safeWeeks.map((w) => {
      const found = w.days.find((d) => d.day === day);
      return found ? found.actualEarnings : 0;
    });
    const avg = Math.round(
      observedValues.reduce((a, b) => a + b, 0) / Math.max(1, observedValues.length)
    );
    const min = Math.min(...observedValues);
    const max = Math.max(...observedValues);

    let patternLabel = 'Variable earnings';
    if (day === 'Wednesday' && safeWeeks.length === 2 && min < 300 && max >= 900) {
      patternLabel = 'Lower in Oct, higher in Nov';
    } else if (day === 'Saturday' && observedValues.every((v) => v >= 1000)) {
      patternLabel = 'Strong in all observed weeks';
    } else if (day === 'Sunday' && max >= 1500) {
      patternLabel = 'Highest earning day';
    } else if (max > 0 && min > 0 && max / min <= 1.45) {
      patternLabel = 'Consistent earnings';
    }

    return {
      day,
      shortDay: day.slice(0, 3),
      observedValues,
      average: avg,
      min,
      max,
      patternLabel,
    };
  });

  const sortedByAvg = [...weekdayStats].sort((a, b) => b.average - a.average);
  const highIncomePeriods = sortedByAvg
    .slice(0, 2)
    .map((s) => `${s.day} (avg ₹${s.average.toLocaleString('en-IN')})`);
  const lowIncomePeriods = [...sortedByAvg]
    .reverse()
    .slice(0, 2)
    .map((s) => `${s.day} (avg ₹${s.average.toLocaleString('en-IN')})`);

  const weeklyTotals = safeWeeks.map((w) => w.totalEarnings);
  const minWeek = Math.min(...weeklyTotals);
  const maxWeek = Math.max(...weeklyTotals);

  return {
    weekCount: safeWeeks.length,
    averageWeeklyEarnings,
    averageDailyEarnings,
    predictedNextWeekLow: Math.round(minWeek * 0.8 + averageWeeklyEarnings * 0.2),
    predictedNextWeekMid: averageWeeklyEarnings,
    predictedNextWeekHigh: Math.round(maxWeek * 0.7 + averageWeeklyEarnings * 0.3),
    weekdayStats,
    highIncomePeriods,
    lowIncomePeriods,
  };
}

export function computeWeekPlan(
  week: WeeklyEarningsRecord,
  allWeeks: WeeklyEarningsRecord[],
  bands: EarningsBands,
  dailyExpenseOverrides: Record<string, number>
): {
  days: DailyComputedRow[];
  summary: WeeklySummaryMetrics;
} {
  const baseline = computeLearnedPattern(allWeeks);
  const normalWeeklyBaseline = baseline.averageWeeklyEarnings;
  const isAboveBaseline = week.totalEarnings > normalWeeklyBaseline;
  const weeklySurplus = Math.max(0, week.totalEarnings - normalWeeklyBaseline);
  // Extra 20% of above-baseline surplus distributed across high-earning days
  const targetSurplusSavings = isAboveBaseline ? Math.round(weeklySurplus * 0.2) : 0;

  let totalExpenses = 0;
  let totalTakeHome = 0;
  let totalFromPayouts = 0;
  let totalFromIncentives = 0;
  let essentialProtected = true;

  const provisionalDays = week.days.map((d) => {
    const workExpenses =
      typeof dailyExpenseOverrides[d.dateISO] === 'number'
        ? Math.max(0, dailyExpenseOverrides[d.dateISO])
        : d.workExpenses;

    const takeHomeEarnings = d.orderPayout + d.incentives - workExpenses;
    const netOrderPayout = Math.max(0, d.orderPayout - workExpenses);
    const dailyEssentialNeed = Math.round(week.weeklyEssentialExpenses / 7);

    // Essential expense safety check: never recommend savings if net take-home cannot cover work + essential needs
    const safeDisposable = takeHomeEarnings - dailyEssentialNeed;
    let baseOrderSave = Math.round(netOrderPayout * 0.1);
    let baseIncentiveSave = Math.round(d.incentives * 0.2);
    let recommendedSavings = baseOrderSave + baseIncentiveSave;
    let essentialShortfall = false;

    if (takeHomeEarnings <= workExpenses || safeDisposable <= 0) {
      recommendedSavings = 0;
      baseOrderSave = 0;
      baseIncentiveSave = 0;
      essentialShortfall = true;
      essentialProtected = false;
    } else if (recommendedSavings > safeDisposable) {
      // Cap savings so essential daily obligations remain fully paid
      const ratio = safeDisposable / recommendedSavings;
      baseOrderSave = Math.floor(baseOrderSave * ratio);
      baseIncentiveSave = Math.floor(baseIncentiveSave * ratio);
      recommendedSavings = baseOrderSave + baseIncentiveSave;
    }

    totalExpenses += workExpenses;
    totalTakeHome += takeHomeEarnings;
    totalFromPayouts += baseOrderSave;
    totalFromIncentives += baseIncentiveSave;

    return {
      ...d,
      workExpenses,
      takeHomeEarnings,
      baseRecommendedSavings: recommendedSavings,
      safeDisposable: Math.max(0, safeDisposable - recommendedSavings),
      essentialShortfall,
    };
  });

  // Allocate surplus bonus savings strictly on days with safe disposable headroom
  const totalHeadroom = provisionalDays.reduce((acc, d) => acc + d.safeDisposable, 0);
  const actualSurplusAllocated = Math.min(targetSurplusSavings, totalHeadroom);
  let surplusLeft = actualSurplusAllocated;

  const computedDays: DailyComputedRow[] = provisionalDays.map((d, idx) => {
    let extraSave = 0;
    if (surplusLeft > 0 && totalHeadroom > 0 && d.safeDisposable > 0) {
      extraSave =
        idx === provisionalDays.length - 1
          ? Math.min(surplusLeft, d.safeDisposable)
          : Math.min(
              d.safeDisposable,
              Math.round((d.safeDisposable / totalHeadroom) * actualSurplusAllocated)
            );
      surplusLeft -= extraSave;
    }

    const recommendedSavings = d.baseRecommendedSavings + extraSave;
    const bandInfo = classifyEarningsBand(d.actualEarnings, bands);

    let recommendation = '';
    if (d.essentialShortfall) {
      recommendation =
        'Protect essential expenses first; ₹0 auto-saved today.';
    } else if (bandInfo.band === 'PURPLE') {
      recommendation = `Lock ₹${recommendedSavings.toLocaleString('en-IN')} into reserve for slower weekdays.`;
    } else if (bandInfo.band === 'GREEN') {
      recommendation = `Save ₹${recommendedSavings.toLocaleString('en-IN')} (10% payout + 20% incentive rule).`;
    } else if (bandInfo.band === 'YELLOW') {
      recommendation = `Modest shift; set aside ₹${recommendedSavings.toLocaleString('en-IN')} carefully.`;
    } else {
      recommendation =
        recommendedSavings > 0
          ? `Low day; cap discretionary spend and save ₹${recommendedSavings}.`
          : 'Low-income day; avoid extra spend and protect your Bill Shield.';
    }

    return {
      dateISO: d.dateISO,
      dateLabel: d.dateLabel,
      day: d.day,
      actualEarnings: d.actualEarnings,
      orderPayout: d.orderPayout,
      incentives: d.incentives,
      completedOrders: d.completedOrders,
      singleRuns: d.singleRuns,
      multiRuns: d.multiRuns,
      workExpenses: d.workExpenses,
      historicalReference: d.historicalReference,
      expectedDemand: d.expectedDemand,
      demandReason: d.demandReason,
      weatherCondition: d.weatherCondition,
      verifiedIncentiveNote: d.verifiedIncentiveNote,
      takeHomeEarnings: d.takeHomeEarnings,
      recommendedSavings,
      essentialShortfall: d.essentialShortfall,
      band: bandInfo.band,
      bandLabel: bandInfo.label,
      recommendation,
    };
  });

  const highest = computedDays.reduce(
    (best, d) =>
      d.actualEarnings > best.amount
        ? { day: d.day, dateLabel: d.dateLabel, amount: d.actualEarnings }
        : best,
    {
      day: computedDays[0].day,
      dateLabel: computedDays[0].dateLabel,
      amount: computedDays[0].actualEarnings,
    }
  );

  const lowest = computedDays.reduce(
    (low, d) =>
      d.actualEarnings < low.amount
        ? { day: d.day, dateLabel: d.dateLabel, amount: d.actualEarnings }
        : low,
    {
      day: computedDays[0].day,
      dateLabel: computedDays[0].dateLabel,
      amount: computedDays[0].actualEarnings,
    }
  );

  const totalRecommendedSavings = computedDays.reduce(
    (acc, d) => acc + d.recommendedSavings,
    0
  );
  const surplusBonusSavings = Math.max(
    0,
    totalRecommendedSavings - (totalFromPayouts + totalFromIncentives)
  );

  const baselineRatio =
    normalWeeklyBaseline > 0
      ? Number((week.totalEarnings / normalWeeklyBaseline).toFixed(2))
      : 1;

  let incomeStatus: 'LOW' | 'HIGH' | 'NORMAL' = 'NORMAL';
  let alertMessage: string | null = null;

  if (week.totalEarnings < normalWeeklyBaseline * 0.92) {
    incomeStatus = 'LOW';
    alertMessage =
      'Your earnings are lower than your usual pattern this week. Consider reducing non-essential expenses and using your emergency savings only if necessary.';
  } else if (week.totalEarnings > normalWeeklyBaseline * 1.08) {
    incomeStatus = 'HIGH';
    alertMessage =
      'Your earnings are higher than usual this week! Consider saving a portion of your additional income to prepare for slower weeks.';
  }

  return {
    days: computedDays,
    summary: {
      totalWeeklyEarnings: week.totalEarnings,
      totalOrderPayout: week.orderPayout,
      totalIncentives: week.incentives,
      averageDailyEarnings: Math.round(week.totalEarnings / 7),
      highestEarningDay: highest,
      lowestEarningDay: lowest,
      totalExpenses,
      totalTakeHome,
      totalRecommendedSavings,
      baselineRatio,
      incomeStatus,
      alertMessage,
      savingsBreakdown: {
        fromOrderPayouts: totalFromPayouts,
        fromIncentives: totalFromIncentives,
        surplusBonusSavings,
        essentialProtected,
      },
    },
  };
}

export function buildCustomWeekRecord(input: {
  weekLabel: string;
  startDateISO: string;
  dailyEarnings: Record<WeekdayName, number>;
  orderPayout: number;
  incentives: number;
  lateNightIncentive: number;
  weeklyIncentiveTarget: number;
  totalOrders: number;
  singleRuns: number;
  multiRuns: number;
  dailyExpenseAverage: number;
}): WeeklyEarningsRecord {
  const totalEarnings = Object.values(input.dailyEarnings).reduce(
    (sum, v) => sum + Math.max(0, v),
    0
  );
  const start = new Date(`${input.startDateISO}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86400000);
  const endDateISO = end.toISOString().slice(0, 10);

  const perDayExpense = Math.max(0, Math.round(input.dailyExpenseAverage));
  const defaultExpenses: Record<WeekdayName, number> = {
    Monday: perDayExpense,
    Tuesday: perDayExpense,
    Wednesday: perDayExpense,
    Thursday: perDayExpense,
    Friday: perDayExpense,
    Saturday: perDayExpense,
    Sunday: perDayExpense,
  };

  const calendarMeta = WEEKDAYS_ORDER.reduce(
    (acc, day) => {
      const isWeekend = day === 'Saturday' || day === 'Sunday';
      acc[day] = {
        historicalReference: `Logged ${day} shift (₹${input.dailyEarnings[day].toLocaleString('en-IN')})`,
        expectedDemand: isWeekend ? 'High' : 'Moderate',
        demandReason: isWeekend
          ? 'Bengaluru weekend dining & delivery demand'
          : 'Standard Bengaluru weekday lunch & dinner slots',
        weatherCondition: 'Bengaluru local forecast · Check rain surge',
        verifiedIncentiveNote:
          input.incentives >= input.weeklyIncentiveTarget
            ? 'Weekly incentive target completed'
            : 'Eligible for active weekly & late-night slabs',
      };
      return acc;
    },
    {} as Record<
      WeekdayName,
      {
        historicalReference: string;
        expectedDemand: ExpectedDemandLevel;
        demandReason: string;
        weatherCondition: string;
        verifiedIncentiveNote: string;
      }
    >
  );

  const missed = Math.max(0, input.weeklyIncentiveTarget - input.incentives);
  const targetCompleted = input.incentives >= input.weeklyIncentiveTarget;
  const avgOrdersPerHundred = Math.max(1, Math.round((input.weeklyIncentiveTarget - input.incentives) / 25));

  return {
    id: `week-${input.startDateISO}-${Date.now()}`,
    weekKey: `${input.startDateISO} to ${endDateISO}`,
    weekLabel: input.weekLabel || `${input.startDateISO} – ${endDateISO}`,
    startDateISO: input.startDateISO,
    endDateISO,
    totalEarnings,
    orderPayout: input.orderPayout,
    incentives: input.incentives,
    lateNightIncentive: input.lateNightIncentive,
    weeklyIncentiveTarget: input.weeklyIncentiveTarget,
    missedIncentiveOpportunity: missed,
    bonusExpiryDate: `${end.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    })} · 11:59 PM`,
    ordersNeededForNextTarget: targetCompleted ? 0 : avgOrdersPerHundred,
    targetCompleted,
    totalOrders: input.totalOrders,
    singleRuns: input.singleRuns,
    multiRuns: input.multiRuns,
    weeklyEssentialExpenses: 2200,
    source: 'custom',
    days: buildDailyBreakdown({
      startDateISO: input.startDateISO,
      dailyTotals: input.dailyEarnings,
      weeklyTotal: totalEarnings,
      weeklyOrderPayout: input.orderPayout,
      weeklyIncentives: input.incentives,
      totalOrders: input.totalOrders,
      singleRuns: input.singleRuns,
      multiRuns: input.multiRuns,
      defaultDailyExpenses: defaultExpenses,
      calendarMeta,
    }),
  };
}
