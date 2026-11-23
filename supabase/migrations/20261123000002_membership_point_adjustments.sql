create table pos_private.member_point_adjustments (
  id bigint generated always as identity primary key,
  member_id uuid not null references pos_private.members (id),
  adjusted_by text not null references pos_private.users (id),
  balance_before bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  reason text not null check (length(btrim(reason)) between 1 and 240),
  created_at timestamptz not null default now(),
  check (balance_before <> balance_after)
);

create index member_point_adjustments_activity
  on pos_private.member_point_adjustments (member_id, created_at desc, id desc);

alter table pos_private.member_point_adjustments enable row level security;
