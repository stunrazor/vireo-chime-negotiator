-- Staging-only Chime Negotiator (PayPal Sandbox) foundation.
-- Hackathon prototype on branch hackathon/paypal-negotiator.
-- Additive only: creates new vireo_negotiator_* tables and RPCs. Modifies NO
-- existing table, RPC, or policy. Apply ONLY to the isolated staging project.
-- Never Main. All demo rows are synthetic and DEMO-marked by construction.

begin;

create table public.vireo_negotiator_transfers (
  id uuid primary key default gen_random_uuid(),
  demo_ref text not null
    check (demo_ref ~ '^DEMO-NEG-[0-9A-Za-z-]{1,60}$'),
  provider_code text not null default 'paypal_sandbox'
    check (provider_code = 'paypal_sandbox'),
  provider_payment_id text not null
    check (length(btrim(provider_payment_id)) between 1 and 200
      and provider_payment_id = btrim(provider_payment_id)),
  paypal_order_id text not null
    check (length(btrim(paypal_order_id)) between 1 and 200
      and paypal_order_id = btrim(paypal_order_id)),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'awaiting_confirmation'
    check (status in (
      'awaiting_confirmation', 'accepted', 'processing',
      'credited', 'settled', 'failed', 'reversed'
    )),
  approved_by_label text not null
    check (length(btrim(approved_by_label)) between 1 and 200),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_code, provider_payment_id)
);

create table public.vireo_negotiator_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null
    references public.vireo_negotiator_transfers(id) on delete restrict,
  provider_code text not null default 'paypal_sandbox'
    check (provider_code = 'paypal_sandbox'),
  provider_event_id text not null
    check (length(btrim(provider_event_id)) between 1 and 200
      and provider_event_id = btrim(provider_event_id)),
  provider_payment_id text not null
    check (length(btrim(provider_payment_id)) between 1 and 200
      and provider_payment_id = btrim(provider_payment_id)),
  status text not null
    check (status in (
      'accepted', 'processing', 'credited', 'settled', 'failed', 'reversed'
    )),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  occurred_at timestamptz not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  unique (provider_code, provider_event_id)
);

create index vireo_negotiator_events_transfer_idx
  on public.vireo_negotiator_events(transfer_id, received_at desc);

alter table public.vireo_negotiator_transfers enable row level security;
alter table public.vireo_negotiator_events enable row level security;

-- Same access posture as the existing payment ledger: no direct client or
-- service-role table access. The security-definer RPCs below are the only
-- write paths.
revoke all on public.vireo_negotiator_transfers,
  public.vireo_negotiator_events
  from public, anon, authenticated, service_role;

-- Create a transfer AFTER the PayPal Sandbox order exists. Called only from
-- the api-server approve path, which runs only on a recorded human approval.
create or replace function public.vireo_create_negotiator_transfer(
  p_demo_ref text,
  p_provider_payment_id text,
  p_paypal_order_id text,
  p_amount_minor bigint,
  p_currency_code text,
  p_approved_by_label text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_demo_ref is null or p_demo_ref !~ '^DEMO-NEG-[0-9A-Za-z-]{1,60}$'
     or p_provider_payment_id is null
     or length(btrim(p_provider_payment_id)) not between 1 and 200
     or p_provider_payment_id <> btrim(p_provider_payment_id)
     or p_paypal_order_id is null
     or length(btrim(p_paypal_order_id)) not between 1 and 200
     or p_paypal_order_id <> btrim(p_paypal_order_id)
     or p_amount_minor is null or p_amount_minor <= 0
     or p_currency_code is null or p_currency_code !~ '^[A-Z]{3}$'
     or p_approved_by_label is null
     or length(btrim(p_approved_by_label)) not between 1 and 200 then
    raise exception 'Invalid negotiator transfer.' using errcode = '22023';
  end if;

  insert into public.vireo_negotiator_transfers(
    demo_ref, provider_payment_id, paypal_order_id,
    amount_minor, currency_code, approved_by_label
  ) values (
    p_demo_ref, btrim(p_provider_payment_id), btrim(p_paypal_order_id),
    p_amount_minor, p_currency_code, btrim(p_approved_by_label)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.vireo_create_negotiator_transfer(
  text, text, text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.vireo_create_negotiator_transfer(
  text, text, text, bigint, text, text
) to service_role;

-- Apply a VERIFIED PayPal webhook event. Mirrors the lifecycle of
-- vireo_apply_payment_provider_event: dedupe durably, match amounts exactly,
-- never regress state.
create or replace function public.vireo_apply_negotiator_event(
  p_transfer_id uuid,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_status text,
  p_currency_code text,
  p_amount_minor bigint,
  p_occurred_at timestamptz,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transfer public.vireo_negotiator_transfers%rowtype;
  v_event_id uuid;
  v_next_status text;
begin
  if p_transfer_id is null
     or p_provider_event_id is null
     or length(btrim(p_provider_event_id)) not between 1 and 200
     or p_provider_event_id <> btrim(p_provider_event_id)
     or p_provider_payment_id is null
     or length(btrim(p_provider_payment_id)) not between 1 and 200
     or p_provider_payment_id <> btrim(p_provider_payment_id)
     or p_status is null
     or p_status not in ('accepted','processing','credited','settled','failed','reversed')
     or p_currency_code is null
     or p_currency_code !~ '^[A-Z]{3}$'
     or p_amount_minor is null or p_amount_minor <= 0
     or p_occurred_at is null
     or p_payload_sha256 is null
     or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid negotiator provider event.' using errcode = '22023';
  end if;

  select t.* into v_transfer
  from public.vireo_negotiator_transfers t
  where t.id = p_transfer_id
  for update;

  if not found then
    raise exception 'Negotiator transfer was not found.' using errcode = 'P0002';
  end if;

  if v_transfer.provider_payment_id is distinct from p_provider_payment_id
     or v_transfer.currency_code is distinct from p_currency_code
     or v_transfer.amount_minor is distinct from p_amount_minor then
    raise exception 'Provider event does not match the payment instruction.'
      using errcode = '23514';
  end if;

  insert into public.vireo_negotiator_events(
    transfer_id, provider_event_id,
    provider_payment_id, status, currency_code, amount_minor,
    occurred_at, payload_sha256
  ) values (
    v_transfer.id, p_provider_event_id,
    p_provider_payment_id, p_status, p_currency_code, p_amount_minor,
    p_occurred_at, p_payload_sha256
  )
  on conflict (provider_code, provider_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    if not exists (
      select 1
      from public.vireo_negotiator_events e
      where e.provider_code = 'paypal_sandbox'
        and e.provider_event_id = p_provider_event_id
        and e.transfer_id = v_transfer.id
        and e.payload_sha256 = p_payload_sha256
    ) then
      raise exception 'Provider event ID was already used for a different event.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'status', v_transfer.status
    );
  end if;

  v_next_status := v_transfer.status;
  if p_status = v_transfer.status then
    null;
  elsif v_transfer.status = 'awaiting_confirmation'
    and p_status in ('accepted','processing','credited','settled','failed') then
    v_next_status := p_status;
  elsif v_transfer.status = 'accepted'
    and p_status in ('processing','credited','settled','failed') then
    v_next_status := p_status;
  elsif v_transfer.status = 'processing'
    and p_status in ('credited','settled','failed') then
    v_next_status := p_status;
  elsif v_transfer.status in ('credited','settled')
    and p_status = 'reversed' then
    v_next_status := 'reversed';
  elsif v_transfer.status in ('accepted','processing','credited','settled')
    and p_status in ('accepted','processing') then
    v_next_status := v_transfer.status;
  else
    raise exception 'Payment status transition is not allowed.'
      using errcode = '23514';
  end if;

  update public.vireo_negotiator_transfers
    set status = v_next_status, updated_at = now()
  where id = v_transfer.id;

  return jsonb_build_object(
    'duplicate', false,
    'status', v_next_status,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.vireo_apply_negotiator_event(
  uuid, text, text, text, text, bigint, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.vireo_apply_negotiator_event(
  uuid, text, text, text, text, bigint, timestamptz, text
) to service_role;

comment on table public.vireo_negotiator_transfers is
  'Hackathon staging only: PayPal Sandbox transfers behind human approval; synthetic DEMO refs only.';
comment on table public.vireo_negotiator_events is
  'Hackathon staging only: idempotent verified-PayPal event ledger; raw bodies never stored.';
comment on function public.vireo_create_negotiator_transfer(
  text, text, text, bigint, text, text
) is
  'Hackathon staging only: record a transfer after PayPal order creation on human approval; service_role only.';
comment on function public.vireo_apply_negotiator_event(
  uuid, text, text, text, text, bigint, timestamptz, text
) is
  'Hackathon staging only: atomically dedupe a verified PayPal event and advance transfer status; service_role only.';

commit;
