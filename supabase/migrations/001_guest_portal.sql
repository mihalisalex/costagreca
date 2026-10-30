-- Costa Greca guest portal
--
-- Security model
--   * Every table has row level security on.
--   * Guests never read tables directly. They call the guest_* functions
--     with their booking code; the functions check the code, rate-limit
--     wrong guesses per IP, and only return that booking's data.
--   * Door, gate and Wi-Fi details (villa_settings with visibility 'stay')
--     are only returned from check-in day to check-out day (Crete time).
--   * The owner signs in with Supabase Auth. Only emails listed in
--     public.owners can read or change bookings, requests and settings.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------

create table public.owners (
  email text primary key
);

create table public.bookings (
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

create table public.guest_requests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
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
create index guest_requests_booking_idx on public.guest_requests (booking_id, created_at desc);
create index guest_requests_status_idx on public.guest_requests (status, created_at desc);

create table public.villa_settings (
  key        text primary key,
  label      text not null,
  value      text not null default '' check (char_length(value) <= 500),
  visibility text not null default 'booking' check (visibility in ('booking', 'stay')),
  sort       int  not null default 0
);

create table public.login_attempts (
  id         bigint generated always as identity primary key,
  ip_address text not null,
  ok         boolean not null,
  at         timestamptz not null default now()
);
create index login_attempts_ip_idx on public.login_attempts (ip_address, at desc);

alter table public.owners         enable row level security;
alter table public.bookings       enable row level security;
alter table public.guest_requests enable row level security;
alter table public.villa_settings enable row level security;
alter table public.login_attempts enable row level security;

-- ---------- Helpers ----------

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owners
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Codes look like CG-7KQM-X3PD (no 0/O/1/I/L to avoid confusion).
create or replace function public.new_booking_code()
returns text
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  raw text;
  candidate text;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    raw := '';
    for i in 0..7 loop
      raw := raw || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    candidate := 'CG-' || substr(raw, 1, 4) || '-' || substr(raw, 5, 4);
    exit when not exists (select 1 from public.bookings where code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table public.bookings alter column code set default public.new_booking_code();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger guest_requests_touch before update on public.guest_requests
  for each row execute function public.touch_updated_at();

-- Finds the booking for a code typed by a guest ("cg 7kqm x3pd", "7KQMX3PD", ...).
-- Codes stop working three days after check-out.
create or replace function public._find_booking(p_code text)
returns public.bookings
language sql stable security definer
set search_path = public
as $$
  with typed as (
    select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as v
  )
  select b.*
  from public.bookings b, typed
  where char_length(typed.v) >= 8
    and replace(b.code, '-', '') = case when typed.v like 'CG%' then typed.v else 'CG' || typed.v end
    and (now() at time zone 'Europe/Athens')::date <= b.check_out + 3
  limit 1;
$$;

-- Checks a guest code with a limit of 10 wrong guesses per IP per 15 minutes.
create or replace function public._guest_auth(p_code text, out booking public.bookings, out err text)
language plpgsql volatile security definer
set search_path = public
as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  ip text := coalesce(nullif(trim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
begin
  delete from public.login_attempts where at < now() - interval '1 day';
  if (select count(*) from public.login_attempts
      where ip_address = ip and not ok and at > now() - interval '15 minutes') >= 10 then
    err := 'too_many_attempts';
    return;
  end if;
  booking := public._find_booking(p_code);
  insert into public.login_attempts (ip_address, ok) values (ip, booking.id is not null);
  if booking.id is null then
    err := 'invalid_code';
  end if;
end;
$$;

create or replace function public._stay_phase(b public.bookings)
returns text
language sql stable
set search_path = public
as $$
  select case
    when (now() at time zone 'Europe/Athens')::date < b.check_in then 'before'
    when (now() at time zone 'Europe/Athens')::date <= b.check_out then 'stay'
    else 'after'
  end;
$$;

-- ---------- Guest API ----------

create or replace function public.guest_session(p_code text)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
declare
  a record;
  b public.bookings;
  phase text;
begin
  select * into a from public._guest_auth(p_code);
  if a.err is not null then
    return json_build_object('error', a.err);
  end if;
  b := a.booking;
  phase := public._stay_phase(b);

  return json_build_object(
    'booking', json_build_object(
      'code', b.code, 'guest_name', b.guest_name,
      'check_in', b.check_in, 'check_out', b.check_out,
      'adults', b.adults, 'children', b.children
    ),
    'phase', phase,
    'today', (now() at time zone 'Europe/Athens')::date,
    'settings', (
      select coalesce(json_object_agg(s.key, json_build_object('label', s.label, 'value', s.value)), '{}'::json)
      from public.villa_settings s
      where s.value <> '' and (s.visibility = 'booking' or phase = 'stay')
    ),
    'requests', (
      select coalesce(json_agg(json_build_object(
        'id', r.id, 'kind', r.kind, 'title', r.title, 'details', r.details,
        'requested_for', r.requested_for, 'status', r.status,
        'owner_note', r.owner_note, 'created_at', r.created_at
      ) order by r.created_at desc), '[]'::json)
      from public.guest_requests r
      where r.booking_id = b.id
    )
  );
end;
$$;

create or replace function public.guest_add_request(
  p_code text, p_kind text, p_title text, p_details jsonb default '{}'::jsonb, p_requested_for date default null
)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
declare
  a record;
  b public.bookings;
  r public.guest_requests;
begin
  select * into a from public._guest_auth(p_code);
  if a.err is not null then
    return json_build_object('error', a.err);
  end if;
  b := a.booking;

  if public._stay_phase(b) = 'after' then
    return json_build_object('error', 'stay_ended');
  end if;
  if p_kind not in ('experience', 'provisions', 'preferences', 'housekeeping')
     or char_length(coalesce(p_title, '')) not between 1 and 160
     or char_length(coalesce(p_details, '{}'::jsonb)::text) > 4000 then
    return json_build_object('error', 'invalid_request');
  end if;
  if (select count(*) from public.guest_requests where booking_id = b.id) >= 60 then
    return json_build_object('error', 'too_many_requests');
  end if;

  insert into public.guest_requests (booking_id, kind, title, details, requested_for)
  values (b.id, p_kind, p_title, coalesce(p_details, '{}'::jsonb), p_requested_for)
  returning * into r;

  return json_build_object('id', r.id, 'status', r.status);
end;
$$;

create or replace function public.guest_cancel_request(p_code text, p_id uuid)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
declare
  a record;
  changed int;
begin
  select * into a from public._guest_auth(p_code);
  if a.err is not null then
    return json_build_object('error', a.err);
  end if;
  update public.guest_requests
    set status = 'cancelled'
    where id = p_id and booking_id = (a.booking).id and status = 'requested';
  get diagnostics changed = row_count;
  return json_build_object('cancelled', changed = 1);
end;
$$;

-- ---------- Function permissions ----------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.guest_session(text) to anon, authenticated;
grant execute on function public.guest_add_request(text, text, text, jsonb, date) to anon, authenticated;
grant execute on function public.guest_cancel_request(text, uuid) to anon, authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.new_booking_code() to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------- Owner access (row level security) ----------

create policy "owner reads own row" on public.owners
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "owners manage bookings" on public.bookings
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owners manage requests" on public.guest_requests
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owners manage villa settings" on public.villa_settings
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Guests and the public get nothing from the tables themselves.
revoke all on public.owners, public.bookings, public.guest_requests, public.villa_settings, public.login_attempts from anon;

-- ---------- Villa details the owner fills in from the dashboard ----------

insert into public.villa_settings (key, label, visibility, sort, value) values
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
  ('door_code',     'Door code',              'stay',   110, '');
