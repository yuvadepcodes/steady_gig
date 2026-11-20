-- SteadyGig Unified Supabase PostgreSQL Schema & Seed
-- Compatible with Kannada Voice Co-Pilot (lib/voice-pipeline.ts) + Screenshot-to-Ledger

-- Clean reset of old incompatible tables (safe since tables are currently empty)
drop table if exists public.transactions cascade;
drop table if exists public.payout_logs cascade;
drop table if exists public.riders cascade;

-- 1. Riders / Profiles Table
create table public.riders (
  id text primary key,
  name text not null default 'Ravi Kumar',
  phone text,
  city text not null default 'Bengaluru',
  zone text not null default 'Koramangala & HSR Layout',
  platform text not null default 'Domino''s (Jubilant FoodWorks)',
  balance numeric(10,2) not null default 1450.00,
  vault_balance numeric(10,2) not null default 5200.00,
  daily_earnings numeric(10,2) not null default 1850.00,
  target_payout numeric(10,2) not null default 6000.00,
  safety_reserve numeric(10,2) not null default 2000.00,
  weekly_obligations numeric(10,2) not null default 3900.00,
  monthly_fixed_bills numeric(10,2) not null default 12000.00,
  bill_due_day integer not null default 5 check (bill_due_day >= 1 and bill_due_day <= 31),
  daily_fuel_spend numeric(10,2) not null default 250.00,
  preferred_language text not null default 'kn-IN' check (preferred_language in ('kn-IN', 'hi-IN', 'en-IN')),
  bill_setup_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Transactions / Voice-Logged Expenses Table
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  rider_id text not null references public.riders(id) on delete cascade,
  category text not null check (category in ('fuel', 'food', 'rent', 'maintenance', 'income', 'payout', 'vault_lock', 'other')),
  amount numeric(10,2) not null check (amount >= 0),
  type text not null default 'expense' check (type in ('expense', 'income', 'vault_lock', 'vault_topup', 'payout')),
  description text,
  raw_kannada_transcript text,
  reply_kn text,
  created_at timestamptz not null default now()
);

-- 3. Parsed Screenshot Payout Logs Table
create table public.payout_logs (
  id uuid primary key default gen_random_uuid(),
  rider_id text not null references public.riders(id) on delete cascade,
  week_label text not null,
  period text not null,
  platform_name text not null default 'Domino''s (Jubilant FoodWorks)',
  total_earnings numeric(10,2) not null,
  order_payout numeric(10,2) not null,
  order_count integer not null default 0,
  incentives numeric(10,2) not null default 0,
  cancelled_orders_count integer not null default 0,
  week_tier text not null check (week_tier in ('LEAN', 'NORMAL', 'PEAK')),
  vault_delta numeric(10,2) not null default 0,
  safe_daily_spend numeric(10,2) not null default 550,
  daily_breakdown jsonb not null default '[]'::jsonb,
  kannada_summary text,
  created_at timestamptz not null default now()
);

-- 4. Row Level Security (RLS) with open demo policies
alter table public.riders enable row level security;
alter table public.transactions enable row level security;
alter table public.payout_logs enable row level security;

create policy "Allow select riders" on public.riders for select using (true);
create policy "Allow insert riders" on public.riders for insert with check (true);
create policy "Allow update riders" on public.riders for update using (true);

create policy "Allow select transactions" on public.transactions for select using (true);
create policy "Allow insert transactions" on public.transactions for insert with check (true);
create policy "Allow update transactions" on public.transactions for update using (true);

create policy "Allow select payout_logs" on public.payout_logs for select using (true);
create policy "Allow insert payout_logs" on public.payout_logs for insert with check (true);
create policy "Allow update payout_logs" on public.payout_logs for update using (true);

-- 5. Enable Supabase Realtime safely
do $$
begin
  alter publication supabase_realtime add table public.riders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.payout_logs;
exception when duplicate_object then null;
end $$;

-- 6. Seed Default Bengaluru Rider
insert into public.riders (
  id, name, phone, city, zone, platform,
  balance, vault_balance, daily_earnings, target_payout, safety_reserve, weekly_obligations
)
values (
  'rider_blr_01',
  'Ravi Kumar',
  '+919876543210',
  'Bengaluru',
  'Koramangala & HSR Layout',
  'Domino''s (Jubilant FoodWorks)',
  1450.00,
  5200.00,
  1850.00,
  6000.00,
  2000.00,
  3900.00
);

-- 7. Seed Recent Transactions
insert into public.transactions (rider_id, category, amount, type, description)
values
  ('rider_blr_01', 'fuel', 250.00, 'expense', 'Shell Koramangala Petrol'),
  ('rider_blr_01', 'food', 80.00, 'expense', 'Darshini Breakfast - Idli Vada'),
  ('rider_blr_01', 'income', 1850.00, 'income', 'Swiggy & Zomato Daily Shifts');

-- 8. Seed Authentic Lean vs Peak Payout Logs
insert into public.payout_logs (
  rider_id, week_label, period, platform_name, total_earnings, order_payout,
  order_count, incentives, cancelled_orders_count, week_tier, vault_delta,
  safe_daily_spend, daily_breakdown, kannada_summary
)
values
  (
    'rider_blr_01',
    'Lean Week (Oct 19–25)',
    'Oct 19–25, 2026',
    'Domino''s (Jubilant FoodWorks)',
    3678.00,
    2710.00,
    103,
    968.00,
    2,
    'LEAN',
    -222.00,
    557.00,
    '[{"day":"Mon","amount":220},{"day":"Tue","amount":250},{"day":"Wed","amount":90},{"day":"Thu","amount":150},{"day":"Fri","amount":270},{"day":"Sat","amount":1110},{"day":"Sun","amount":1588}]'::jsonb,
    'ಈ ವಾರದ ಗಳಿಕೆ ₹3,678 ಕಡಿಮೆಯಿದೆ. ವಾರದ ಖರ್ಚು ಪೂರೈಸಲು ವಾಲ್ಟ್‌ನಿಂದ ₹222 ಬಳಸಲಾಗಿದೆ.'
  ),
  (
    'rider_blr_01',
    'Peak Festive Week (Nov 09–15)',
    'Nov 09–15, 2026',
    'Domino''s (Jubilant FoodWorks)',
    10712.00,
    7660.00,
    308,
    3052.00,
    1,
    'PEAK',
    3500.00,
    1030.00,
    '[{"day":"Mon","amount":1190},{"day":"Tue","amount":1110},{"day":"Wed","amount":1010},{"day":"Thu","amount":1080},{"day":"Fri","amount":1110},{"day":"Sat","amount":1150},{"day":"Sun","amount":4062}]'::jsonb,
    'ಹಬ್ಬದ ವಾರದ ಒಟ್ಟು ಗಳಿಕೆ ₹10,712! ಭವಿಷ್ಯದ ಕಡಿಮೆ ವಾರಕ್ಕಾಗಿ ₹3,500 ವಾಲ್ಟ್‌ನಲ್ಲಿ ಲಾಕ್ ಮಾಡಲಾಗಿದೆ.'
  );
