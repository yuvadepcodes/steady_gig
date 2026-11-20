'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Shield, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  buildCustomWeekRecord,
  WEEKDAYS_ORDER,
  WeekdayName,
  WeeklyEarningsRecord,
} from '@/lib/financial-calendar';

interface ScreenshotUploadModalProps {
  open: boolean;
  riderId: string;
  currentBalance: number;
  onClose: () => void;
  onWeekApplied: (record: WeeklyEarningsRecord, newBalance: number) => void;
}

export default function ScreenshotUploadModal({
  open,
  riderId,
  currentBalance,
  onClose,
  onWeekApplied,
}: ScreenshotUploadModalProps) {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parsedReady, setParsedReady] = useState(false);
  const [addToBalance, setAddToBalance] = useState(true);

  const [platformName, setPlatformName] = useState('Swiggy');
  const [weekLabel, setWeekLabel] = useState('Nov 16–22, 2026');
  const [startDateISO, setStartDateISO] = useState('2026-11-16');
  const [orderPayout, setOrderPayout] = useState('4200');
  const [incentives, setIncentives] = useState('950');
  const [totalOrders, setTotalOrders] = useState('145');
  const [singleRuns, setSingleRuns] = useState('112');
  const [multiRuns, setMultiRuns] = useState('33');
  const [dailyMap, setDailyMap] = useState<Record<WeekdayName, string>>({
    Monday: '580',
    Tuesday: '610',
    Wednesday: '540',
    Thursday: '640',
    Friday: '760',
    Saturday: '940',
    Sunday: '1080',
  });

  if (!open) return null;

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setParsing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/parse-screenshot', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json().catch(() => ({}))) as {
        parsed?: {
          platformName: string;
          weekLabel: string;
          startDateISO: string;
          orderPayout: number;
          incentives: number;
          totalOrders: number;
          singleRuns: number;
          multiRuns: number;
          dailyEarnings: Record<WeekdayName, number>;
        };
        error?: string;
      };

      if (!res.ok || !data.parsed) {
        setErrorMsg(
          data.error ||
            'Could not read earnings automatically. You can review and adjust numbers below.'
        );
        setParsedReady(true);
        return;
      }

      const p = data.parsed;
      setPlatformName(p.platformName || 'Delivery Platform');
      setWeekLabel(p.weekLabel || `${p.startDateISO} Week`);
      setStartDateISO(p.startDateISO || '2026-11-16');
      setOrderPayout(String(p.orderPayout ?? 0));
      setIncentives(String(p.incentives ?? 0));
      setTotalOrders(String(p.totalOrders ?? 1));
      setSingleRuns(String(p.singleRuns ?? p.totalOrders ?? 1));
      setMultiRuns(String(p.multiRuns ?? 0));
      setDailyMap({
        Monday: String(p.dailyEarnings?.Monday ?? 0),
        Tuesday: String(p.dailyEarnings?.Tuesday ?? 0),
        Wednesday: String(p.dailyEarnings?.Wednesday ?? 0),
        Thursday: String(p.dailyEarnings?.Thursday ?? 0),
        Friday: String(p.dailyEarnings?.Friday ?? 0),
        Saturday: String(p.dailyEarnings?.Saturday ?? 0),
        Sunday: String(p.dailyEarnings?.Sunday ?? 0),
      });
      setParsedReady(true);
    } catch {
      setErrorMsg(
        'Screenshot upload failed. Enter or edit the weekly payout numbers below.'
      );
      setParsedReady(true);
    } finally {
      setParsing(false);
    }
  };

  const dailySum = WEEKDAYS_ORDER.reduce(
    (sum, day) => sum + Math.max(0, Number(dailyMap[day]) || 0),
    0
  );

  const handleSaveAndApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const parsedDaily: Record<WeekdayName, number> = {
      Monday: Math.max(0, Number(dailyMap.Monday) || 0),
      Tuesday: Math.max(0, Number(dailyMap.Tuesday) || 0),
      Wednesday: Math.max(0, Number(dailyMap.Wednesday) || 0),
      Thursday: Math.max(0, Number(dailyMap.Thursday) || 0),
      Friday: Math.max(0, Number(dailyMap.Friday) || 0),
      Saturday: Math.max(0, Number(dailyMap.Saturday) || 0),
      Sunday: Math.max(0, Number(dailyMap.Sunday) || 0),
    };

    const orderPayNum = Math.max(0, Number(orderPayout) || 0);
    const incentiveNum = Math.max(0, Number(incentives) || 0);

    const record = buildCustomWeekRecord({
      weekLabel: weekLabel.trim() || `${startDateISO} Week`,
      startDateISO,
      dailyEarnings: parsedDaily,
      orderPayout: orderPayNum,
      incentives: incentiveNum,
      lateNightIncentive: Math.round(incentiveNum * 0.25),
      weeklyIncentiveTarget: 2000,
      totalOrders: Math.max(1, Number(totalOrders) || 1),
      singleRuns: Math.max(0, Number(singleRuns) || 0),
      multiRuns: Math.max(0, Number(multiRuns) || 0),
      dailyExpenseAverage: 250,
    });

    const newBalance = addToBalance
      ? currentBalance + record.totalEarnings
      : currentBalance;

    try {
      if (supabase) {
        const tier =
          record.totalEarnings < 5000
            ? 'LEAN'
            : record.totalEarnings >= 9000
            ? 'PEAK'
            : 'NORMAL';

        await supabase.from('payout_logs').insert({
          rider_id: riderId,
          week_label: record.weekLabel,
          period: record.weekKey,
          platform_name: platformName.trim() || 'Delivery Platform',
          total_earnings: record.totalEarnings,
          order_payout: record.orderPayout,
          order_count: record.totalOrders,
          incentives: record.incentives,
          week_tier: tier,
          vault_delta: Math.round(record.totalEarnings * 0.12),
          safe_daily_spend: Math.round((record.totalEarnings * 0.75) / 7),
          daily_breakdown: record.days.map((d) => ({
            day: d.day.slice(0, 3),
            amount: d.actualEarnings,
          })),
          kannada_summary: `${record.weekLabel}: ₹${record.totalEarnings}`,
        });

        if (addToBalance && record.totalEarnings > 0) {
          await supabase
            .from('riders')
            .update({
              balance: newBalance,
              daily_earnings: parsedDaily.Sunday || Math.round(record.totalEarnings / 7),
              updated_at: new Date().toISOString(),
            })
            .eq('id', riderId);

          await supabase.from('transactions').insert({
            rider_id: riderId,
            category: 'payout',
            amount: record.totalEarnings,
            type: 'payout',
            description: `Payout Screenshot (${record.weekLabel})`,
          });
        }

        window.dispatchEvent(new CustomEvent('steadygig:refresh'));
      }

      onWeekApplied(record, newBalance);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screenshot-upload-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2
              id="screenshot-upload-title"
              className="text-base font-bold text-slate-900"
            >
              Upload Weekly Payout Screenshot
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <Shield className="h-3.5 w-3.5 text-[#047857] shrink-0" />
              <span>
                Parsed strictly in memory — zero image files saved, zero bank PII stored.
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* File Picker Zone */}
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-center transition-colors hover:border-[#047857] hover:bg-emerald-50/40">
          {parsing ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-[#047857]" />
              <span className="mt-2 text-xs font-semibold text-slate-800">
                Reading payout &amp; daily bars in memory...
              </span>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6 text-[#047857]" />
              <span className="mt-2 text-xs font-semibold text-slate-900">
                Choose Swiggy, Zomato, or Domino&apos;s earnings screenshot
              </span>
              <span className="mt-0.5 text-[11px] text-slate-500">
                PNG, JPG, or WebP up to 8 MB · Updates Bill Shield &amp; Calendar forecast
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
        </label>

        {!parsedReady && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setParsedReady(true)}
              className="text-xs font-medium text-[#047857] hover:underline"
            >
              Or enter weekly earnings manually →
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {errorMsg}
          </div>
        )}

        {parsedReady && (
          <form onSubmit={handleSaveAndApply} className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-950">
                <CheckCircle2 className="h-4 w-4 text-[#047857]" />
                <span>Review Extracted Weekly Figures</span>
              </div>
              <span className="font-mono text-sm font-bold text-[#047857] tabular-nums">
                Total: ₹{dailySum.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-slate-600">
                <span className="font-medium">Platform</span>
                <input
                  type="text"
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span className="font-medium">Week Label</span>
                <input
                  type="text"
                  required
                  value={weekLabel}
                  onChange={(e) => setWeekLabel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span className="font-medium">Week Start (Mon)</span>
                <input
                  type="date"
                  required
                  value={startDateISO}
                  onChange={(e) => setStartDateISO(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
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
                    value={dailyMap[day]}
                    onChange={(e) =>
                      setDailyMap((prev) => ({ ...prev, [day]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900 tabular-nums"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-xs text-slate-600">
                <span>Order Payout (₹)</span>
                <input
                  type="number"
                  min={0}
                  value={orderPayout}
                  onChange={(e) => setOrderPayout(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span>Incentives (₹)</span>
                <input
                  type="number"
                  min={0}
                  value={incentives}
                  onChange={(e) => setIncentives(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span>Total Orders</span>
                <input
                  type="number"
                  min={1}
                  value={totalOrders}
                  onChange={(e) => setTotalOrders(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span>Single / Multi</span>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    aria-label="Single runs"
                    value={singleRuns}
                    onChange={(e) => setSingleRuns(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-sm text-slate-900"
                  />
                  <input
                    type="number"
                    min={0}
                    aria-label="Multi runs"
                    value={multiRuns}
                    onChange={(e) => setMultiRuns(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-sm text-slate-900"
                  />
                </div>
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={addToBalance}
                onChange={(e) => setAddToBalance(e.target.checked)}
                className="rounded border-slate-300 text-[#047857]"
              />
              <span>
                Add ₹{dailySum.toLocaleString('en-IN')} to Current Balance and recalculate Bill Shield &amp; Fuel Reserve
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#047857] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-50"
              >
                {saving ? 'Applying...' : 'Apply to Cashflow & Calendar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
