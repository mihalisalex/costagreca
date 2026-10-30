// Database structure for the guest portal. Every statement is safe to run
// repeatedly, so the API applies it automatically on first use.
export const SCHEMA = `
create table if not exists bookings (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  guest_name  text not null check (char_length(guest_name) between 1 and 120),
  guest_email text check (guest_email is null or char_length(guest_email) <= 200),
  check_in    date not null,
  check_out   date not null,
  adults      int  not null default 2 check (adults between 1 and 14),
  children    int  not null default 0 check (children between 0 and 13),
  notes       text check (notes is null or char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  check (check_out > check_in)
);

create table if not exists guest_requests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  kind          text not null check (kind in ('experience', 'provisions', 'preferences', 'housekeeping')),
  title         text not null check (char_length(title) between 1 and 160),
  details       jsonb not null default '{}'::jsonb,
  requested_for date,
  status        text not null default 'requested'
                check (status in ('requested', 'confirmed', 'declined', 'done', 'cancelled')),
  owner_note    text check (owner_note is null or char_length(owner_note) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists guest_requests_booking_idx on guest_requests (booking_id, created_at desc);

create table if not exists villa_settings (
  key        text primary key,
  label      text not null,
  value      text not null default '' check (char_length(value) <= 500),
  visibility text not null default 'booking' check (visibility in ('booking', 'stay')),
  sort       int  not null default 0
);

create table if not exists login_attempts (
  id    bigint generated always as identity primary key,
  scope text not null,
  ok    boolean not null,
  at    timestamptz not null default now()
);
create index if not exists login_attempts_scope_idx on login_attempts (scope, at desc);

insert into villa_settings (key, label, visibility, sort, value) values
  ('address',       'Villa address',          'booking', 10, ''),
  ('maps_link',     'Google Maps link',       'booking', 20, ''),
  ('checkin_time',  'Check-in from',          'booking', 30, ''),
  ('checkout_time', 'Check-out by',           'booking', 40, ''),
  ('host_name',     'Your host',              'booking', 50, ''),
  ('host_whatsapp', 'Host WhatsApp (digits)', 'booking', 60, ''),
  ('emergency',     'Emergency number',       'booking', 70, '112'),
  ('wifi_name',     'Wi-Fi network',          'stay',    80, ''),
  ('wifi_password', 'Wi-Fi password',         'stay',    90, ''),
  ('gate_code',     'Gate code',              'stay',   100, ''),
  ('door_code',     'Door code',              'stay',   110, '')
on conflict (key) do nothing;
`;
