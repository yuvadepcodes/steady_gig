-- SteadyGig Supabase PostgreSQL Schema & Realtime Setup
-- Co-pilot and Cash-Flow Smoothing Vault for Bengaluru Gig Riders

-- 1. Create Riders / Profiles Table
create table if not exists public.riders (
  id text primary key,
  name text not null default 'Ravi Kumar',
  phone text,
  balance numeric(10,2) not null default 1450.00,
  vault_balance numeric(10,2) not null default 5200.00,
  daily_earnings numeric(10,2) not null default 1850.00,
  target_payout numeric(10,2) not null default 6000.00,
  safety_reserve numeric(10,2) not null default 2000.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Create Transactions / Expenses Table
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  rider_id text not null references public.riders(id) on delete cascade,
  category text not null check (category in ('fuel', 'food', 'rent', 'maintenance', 'income', 'payout', 'other')),
  amount numeric(10,2) not null check (amount >= 0),
  type text not null default 'expense' check (type in ('expense', 'income', 'vault_lock', 'payout')),
  description text,
  created_at timestamptz not null default now()
);

-- 3. Row Level Security (RLS)
alter table public.riders enable row level security;
alter table public.transactions enable row level security;

-- Allow anon and authenticated access for demo / app co-pilot
create policy "Allow select riders" on public.riders for select using (true);
create policy "Allow insert riders" on public.riders for insert with check (true);
create policy "Allow update riders" on public.riders for update using (true);

create policy "Allow select transactions" on public.transactions for select using (true);
create policy "Allow insert transactions" on public.transactions for insert with check (true);
create policy "Allow update transactions" on public.transactions for update using (true);

-- 4. Enable Supabase Realtime for instant UI reflection
alter publication supabase_realtime add table public.riders;
alter publication supabase_realtime add table public.transactions;

-- 5. Seed default demo rider
insert into public.riders (id, name, phone, balance, vault_balance, daily_earnings, target_payout, safety_reserve)
values (
  'rider_blr_01',
  'Ravi Kumar',
  '+919876543210',
  1450.00,
  5200.00,
  1850.00,
  6000.00,
  2000.00
)
on conflict (id) do update set
  balance = excluded.balance,
  vault_balance = excluded.vault_balance;

-- Seed recent transactions
insert into public.transactions (rider_id, category, amount, type, description)
values
  ('rider_blr_01', 'fuel', 250.00, 'expense', 'Shell Koramangala Petrol'),
  ('rider_blr_01', 'food', 80.00, 'expense', 'Darshini Breakfast - Idli Vada'),
  ('rider_blr_01', 'income', 1850.00, 'income', 'Swiggy & Zomato Daily Shifts')
on conflict do nothing;
