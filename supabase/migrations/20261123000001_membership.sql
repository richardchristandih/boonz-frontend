create table pos_private.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  email text not null unique check (email = lower(email) and length(email) <= 254),
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  points bigint not null default 0,
  created_at timestamptz not null default now()
);

create table pos_private.member_rewards (
  product_id text primary key references pos_private.products (id) on delete cascade,
  points integer not null check (points between 1 and 1000000),
  active boolean not null default true
);

create table pos_private.member_points (
  id bigint generated always as identity primary key,
  member_id uuid not null references pos_private.members (id),
  order_id text not null references pos_private.orders (id),
  kind text not null check (kind in ('earned', 'redeemed', 'earn_reversed', 'redemption_returned')),
  points integer not null check (
    (kind in ('earned', 'redemption_returned') and points > 0)
    or (kind in ('redeemed', 'earn_reversed') and points < 0)
  ),
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);

create index member_points_activity on pos_private.member_points (member_id, id desc);
create unique index order_checkout_id on pos_private.orders ((data->>'checkoutId'))
  where data ? 'checkoutId';

alter table pos_private.members enable row level security;
alter table pos_private.member_rewards enable row level security;
alter table pos_private.member_points enable row level security;

create table pos_private.membership_staff (
  user_id text primary key references pos_private.users (id) on delete cascade
);
alter table pos_private.membership_staff enable row level security;
