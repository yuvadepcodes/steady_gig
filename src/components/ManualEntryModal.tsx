'use client';

import React, { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PlatformIncentive } from '@/lib/bengaluru-calendar';

interface ManualEntryModalProps {
  open: boolean;
  initialTab?: 'transaction' | 'offer';
  riderId: string;
  currentBalance: number;
  onClose: () => void;
  onTransactionSaved: (newBalance: number) => void;
  onOfferAdded: (offer: PlatformIncentive) => void;
}

const TX_CATEGORIES: {
  key: 'fuel' | 'food' | 'rent' | 'maintenance' | 'income';
  label: string;
  isIncome?: boolean;
}[] = [
  { key: 'fuel', label: 'Bike Petrol' },
  { key: 'food', label: 'Food / Tea' },
  { key: 'rent', label: 'Rent / EMI' },
  { key: 'maintenance', label: 'Repair' },
  { key: 'income', label: '+ Add Earnings', isIncome: true },
];

export default function ManualEntryModal({
  open,
  initialTab = 'transaction',
  riderId,
  currentBalance,
  onClose,
  onTransactionSaved,
  onOfferAdded,
}: ManualEntryModalProps) {
  const [tab, setTab] = useState<'transaction' | 'offer'>(initialTab);
  const [saving, setSaving] = useState(false);

  // Transaction state
  const [category, setCategory] = useState<
    'fuel' | 'food' | 'rent' | 'maintenance' | 'income'
  >('fuel');
  const [amount, setAmount] = useState('200');
  const [description, setDescription] = useState('');

  // Platform Offer state
  const [platformName, setPlatformName] = useState('Swiggy');
  const [applicableDate, setApplicableDate] = useState('2026-11-22');
  const [timeWindow, setTimeWindow] = useState('7 PM–11 PM');
  const [ordersRequired, setOrdersRequired] = useState('12');
  const [bonusAmount, setBonusAmount] = useState('350');
  const [eligibility, setEligibility] = useState('85% acceptance rate');
  const [verifiedByRider, setVerifiedByRider] = useState(true);

  if (!open) return null;

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmt = Math.max(1, Math.round(Number(amount) || 0));
    if (!numericAmt) return;

    setSaving(true);
    const isIncome = category === 'income';
    const nextBalance = isIncome
      ? currentBalance + numericAmt
      : Math.max(0, currentBalance - numericAmt);

    try {
      if (supabase) {
        await supabase.from('transactions').insert({
          rider_id: riderId,
          category,
          amount: numericAmt,
          type: isIncome ? 'income' : 'expense',
          description:
            description.trim() ||
            (isIncome
              ? `Manual earnings (+₹${numericAmt})`
              : `Manual ${category} (₹${numericAmt})`),
        });

        await supabase
          .from('riders')
          .update({
            balance: nextBalance,
            updated_at: new Date().toISOString(),
          })
          .eq('id', riderId);

        window.dispatchEvent(new CustomEvent('steadygig:refresh'));
      }

      onTransactionSaved(nextBalance);
      setDescription('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOffer = (e: React.FormEvent) => {
    e.preventDefault();
    const newOffer: PlatformIncentive = {
      id: `inc-${Date.now()}`,
      platformName: platformName.trim() || 'Swiggy',
      applicableDate,
      timeWindow: timeWindow.trim() || '7 PM–11 PM',
      ordersRequired: ordersRequired ? Number(ordersRequired) : null,
      minEarningsCondition: 'Verify inside rider app',
      bonusAmount: bonusAmount ? Number(bonusAmount) : null,
      rainOrSurgeBonus: 'Peak shift offer',
      eligibilityConditions: eligibility.trim() || 'Active login hours',
      expiryDate: applicableDate,
      verifiedByRider,
      statusNote: verifiedByRider
        ? 'Verified by rider from app'
        : 'Check actual rider app offer.',
    };
    onOfferAdded(newOffer);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2
            id="manual-entry-title"
            className="text-base font-bold text-slate-900"
          >
            Manual Entry
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual entry"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Segmented Control */}
        <div className="mt-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('transaction')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'transaction'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Log Expense / Income
          </button>
          <button
            type="button"
            onClick={() => setTab('offer')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'offer'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Add Platform Offer
          </button>
        </div>

        {tab === 'transaction' ? (
          <form onSubmit={handleSaveTransaction} className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {TX_CATEGORIES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCategory(item.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === item.key
                      ? item.isIncome
                        ? 'border-[#047857] bg-emerald-50 text-[#047857]'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[100, 200, 300, 500, 1000].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAmount(String(chip))}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-medium tabular-nums ${
                    Number(amount) === chip
                      ? 'border-[#047857] bg-emerald-50 text-[#047857]'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ₹{chip}
                </button>
              ))}
            </div>

            <label className="block text-xs text-slate-600">
              <span className="font-medium">Amount (₹)</span>
              <input
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-base font-bold text-slate-900"
              />
            </label>

            <label className="block text-xs text-slate-600">
              <span className="font-medium">Note (optional)</span>
              <input
                type="text"
                placeholder="e.g. HP Petrol Koramangala"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#047857] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>
                      {category === 'income' ? 'Add Earnings' : 'Save Expense'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveOffer} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600">
                <span className="font-medium">Platform</span>
                <input
                  type="text"
                  required
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span className="font-medium">Date</span>
                <input
                  type="date"
                  required
                  value={applicableDate}
                  onChange={(e) => setApplicableDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm text-slate-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs text-slate-600">
                <span className="font-medium">Time Window</span>
                <input
                  type="text"
                  required
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span className="font-medium">Orders Req.</span>
                <input
                  type="number"
                  min={1}
                  value={ordersRequired}
                  onChange={(e) => setOrdersRequired(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span className="font-medium">Bonus (₹)</span>
                <input
                  type="number"
                  min={0}
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                />
              </label>
            </div>

            <label className="block text-xs text-slate-600">
              <span className="font-medium">Eligibility</span>
              <input
                type="text"
                value={eligibility}
                onChange={(e) => setEligibility(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={verifiedByRider}
                onChange={(e) => setVerifiedByRider(e.target.checked)}
                className="rounded border-slate-300 text-[#047857]"
              />
              <span>Verified in rider app (displays on Calendar)</span>
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
                className="rounded-lg bg-[#047857] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
              >
                Save Offer to Calendar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
