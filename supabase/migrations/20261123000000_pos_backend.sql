create schema pos_private;
revoke all on schema pos_private from public, anon, authenticated;

-- Store the existing POS record shape so older orders and references survive the import.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['categories', 'products', 'promotions', 'inventory', 'users', 'settings', 'orders']
  loop
    execute format(
      'create table pos_private.%I (
        id text primary key check (id ~ ''^[a-f0-9]{24}$''),
        data jsonb not null check (jsonb_typeof(data) = ''object'')
      )', table_name
    );
    execute format('alter table pos_private.%I enable row level security', table_name);
  end loop;
end $$;

create unique index product_sku on pos_private.products ((data->>'sku'));
create unique index category_name on pos_private.categories (lower(data->>'name'));
create unique index category_slug on pos_private.categories ((data->>'slug'));
create unique index user_email on pos_private.users ((data->>'email'));
create unique index setting_key on pos_private.settings ((data->>'key'));
create index order_created_at on pos_private.orders ((data->>'createdAt') desc);
create index order_number on pos_private.orders ((data->>'orderNumber'));

create table pos_private.order_counters (
  day date primary key,
  last_number integer not null check (last_number > 0)
);
alter table pos_private.order_counters enable row level security;

create table pos_private.admin_pin (
  singleton boolean primary key default true check (singleton),
  hash text,
  expires_at timestamptz not null,
  cooldown_until timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0)
);
alter table pos_private.admin_pin enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pos-product-images', 'pos-product-images', true, 5242880,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
);
