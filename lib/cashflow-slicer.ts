import { supabase } from './supabase';

export type SupportedLanguage = 'kn-IN' | 'hi-IN' | 'en-IN';

export interface RiderBillProfile {
  riderId: string;
  name: string;
  platform: string;
  city: string;
  zone: string;
  currentBalance: number;
  monthlyFixedBills: number;
  billDueDay: number; // 1..31
  dailyFuelSpend: number;
  preferredLanguage: SupportedLanguage;
  billSetupCompleted: boolean;
  dailyEarnings: number;
  targetPayout: number;
}

export interface CashflowSliceResult {
  totalCash: number;
  daysLeftToDueDate: number;
  nextDueDateLabel: string;
  monthlyFixedBills: number;
  billShieldAllocated: number;
  billShieldTargetByToday: number;
  billShieldProgressPct: number;
  billShortfallToMonthlyTotal: number;
  dailyBillQuotaNeeded: number;
  fuelReserveTarget: number;
  fuelReserveAllocated: number;
  fuelDaysCovered: number;
  fuelTomorrowCovered: boolean;
  trueSpendableCash: number;
}

export const DEFAULT_BILL_PROFILE: RiderBillProfile = {
  riderId: 'rider_blr_01',
  name: 'Ravi Kumar',
  platform: "Domino's (Jubilant FoodWorks)",
  city: 'Bengaluru',
  zone: 'Koramangala & HSR Layout',
  currentBalance: 6650,
  monthlyFixedBills: 12000,
  billDueDay: 5,
  dailyFuelSpend: 250,
  preferredLanguage: 'kn-IN',
  billSetupCompleted: false,
  dailyEarnings: 1850,
  targetPayout: 6000,
};

function getStorageKey(riderId: string): string {
  return `steadygig:bill_profile:${riderId}`;
}

export function getNextDueDateInfo(
  billDueDay: number,
  referenceDate: Date = new Date()
): { daysLeft: number; label: string } {
  const clampedDay = Math.min(31, Math.max(1, Math.round(billDueDay || 1)));
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const todayDay = referenceDate.getDate();

  const daysInThisMonth = new Date(y, m + 1, 0).getDate();
  const targetThisMonthDay = Math.min(clampedDay, daysInThisMonth);

  let targetYear = y;
  let targetMonth = m;
  let targetDay = targetThisMonthDay;

  if (todayDay > targetThisMonthDay) {
    targetMonth = m + 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
    const daysInNextMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    targetDay = Math.min(clampedDay, daysInNextMonth);
  }

  const todayUTC = Date.UTC(y, m, todayDay);
  const dueUTC = Date.UTC(targetYear, targetMonth, targetDay);
  const daysLeft = Math.max(0, Math.round((dueUTC - todayUTC) / 86400000));

  const label = new Date(dueUTC).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });

  return { daysLeft, label };
}

/**
 * Bill-First Cashflow Slicer:
 * Priority 1: Bike Fuel Reserve (protects 2 working shifts so rider can ride tomorrow)
 * Priority 2: Upcoming Bills Shield (protects smart due-date pace quota toward monthly Rent + EMI)
 * Priority 3: True Spendable Cash (remaining guilt-free cash after Fuel & Bill quotas)
 */
export function sliceBillFirstCashflow(
  profile: RiderBillProfile,
  referenceDate: Date = new Date()
): CashflowSliceResult {
  const totalCash = Math.max(0, Math.round(profile.currentBalance || 0));
  const monthlyFixedBills = Math.max(0, Math.round(profile.monthlyFixedBills || 0));
  const dailyFuelSpend = Math.max(0, Math.round(profile.dailyFuelSpend || 0));

  const { daysLeft, label: nextDueDateLabel } = getNextDueDateInfo(
    profile.billDueDay,
    referenceDate
  );

  // 1. Bike Fuel Reserve: protect 2 working shifts (today + tomorrow)
  const fuelReserveTarget = dailyFuelSpend * 2;
  const fuelReserveAllocated = Math.min(totalCash, fuelReserveTarget);
  const fuelDaysCovered =
    dailyFuelSpend > 0
      ? Number((fuelReserveAllocated / dailyFuelSpend).toFixed(1))
      : 0;
  const fuelTomorrowCovered =
    dailyFuelSpend === 0 || fuelReserveAllocated >= dailyFuelSpend;

  // 2. Upcoming Bills Shield: pace quota scaling cleanly to 100% in the final week
  const remainingAfterFuel = Math.max(0, totalCash - fuelReserveAllocated);
  const effectiveDaysLeft = Math.max(1, daysLeft);
  const cycleElapsedRatio = Math.min(
    1,
    Math.max(0.25, (30 - Math.min(30, daysLeft)) / 30)
  );
  const weeklyPaceQuota =
    Math.ceil(monthlyFixedBills / effectiveDaysLeft) * Math.min(7, effectiveDaysLeft);
  const billShieldTargetByToday =
    daysLeft <= 7
      ? monthlyFixedBills
      : Math.min(
          monthlyFixedBills,
          Math.max(Math.round(monthlyFixedBills * cycleElapsedRatio), weeklyPaceQuota)
        );

  const billShieldAllocated = Math.min(
    monthlyFixedBills,
    remainingAfterFuel,
    billShieldTargetByToday
  );
  const billShieldProgressPct =
    monthlyFixedBills > 0
      ? Math.min(100, Math.round((billShieldAllocated / monthlyFixedBills) * 100))
      : 100;
  const billShortfallToMonthlyTotal = Math.max(
    0,
    monthlyFixedBills - billShieldAllocated
  );
  const dailyBillQuotaNeeded =
    billShortfallToMonthlyTotal > 0
      ? Math.ceil(billShortfallToMonthlyTotal / effectiveDaysLeft)
      : 0;

  // 3. True Spendable Cash: remaining guilt-free money
  const trueSpendableCash = Math.max(
    0,
    totalCash - fuelReserveAllocated - billShieldAllocated
  );

  return {
    totalCash,
    daysLeftToDueDate: daysLeft,
    nextDueDateLabel,
    monthlyFixedBills,
    billShieldAllocated,
    billShieldTargetByToday,
    billShieldProgressPct,
    billShortfallToMonthlyTotal,
    dailyBillQuotaNeeded,
    fuelReserveTarget,
    fuelReserveAllocated,
    fuelDaysCovered,
    fuelTomorrowCovered,
    trueSpendableCash,
  };
}

export function readLocalBillProfile(riderId: string): Partial<RiderBillProfile> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(riderId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<RiderBillProfile>;
  } catch {
    return null;
  }
}

export function writeLocalBillProfile(profile: RiderBillProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      getStorageKey(profile.riderId),
      JSON.stringify({
        monthlyFixedBills: profile.monthlyFixedBills,
        billDueDay: profile.billDueDay,
        dailyFuelSpend: profile.dailyFuelSpend,
        preferredLanguage: profile.preferredLanguage,
        billSetupCompleted: profile.billSetupCompleted,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export async function persistRiderBillProfile(
  profile: RiderBillProfile
): Promise<{ ok: boolean }> {
  writeLocalBillProfile(profile);

  if (!supabase) {
    return { ok: true };
  }

  const weeklyEquivalent = Math.max(500, Math.round(profile.monthlyFixedBills / 4.33));
  const slice = sliceBillFirstCashflow(profile);

  // Try writing extended bill-first columns first
  const extendedPayload = {
    balance: profile.currentBalance,
    vault_balance: slice.billShieldAllocated,
    weekly_obligations: weeklyEquivalent,
    safety_reserve: profile.dailyFuelSpend,
    monthly_fixed_bills: profile.monthlyFixedBills,
    bill_due_day: profile.billDueDay,
    daily_fuel_spend: profile.dailyFuelSpend,
    preferred_language: profile.preferredLanguage,
    bill_setup_completed: profile.billSetupCompleted,
    updated_at: new Date().toISOString(),
  };

  const { error: extError } = await supabase
    .from('riders')
    .update(extendedPayload)
    .eq('id', profile.riderId);

  if (!extError) {
    return { ok: true };
  }

  // Fallback gracefully if live table has core columns only
  const { error: baseError } = await supabase
    .from('riders')
    .update({
      balance: profile.currentBalance,
      vault_balance: slice.billShieldAllocated,
      weekly_obligations: weeklyEquivalent,
      safety_reserve: profile.dailyFuelSpend,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.riderId);

  return { ok: !baseError };
}
