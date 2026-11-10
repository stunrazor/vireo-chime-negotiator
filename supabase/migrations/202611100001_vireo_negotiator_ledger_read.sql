-- Staging ledger read path for the Chime Negotiator demo (AG Grid viewer).
--
-- Tables stay locked down (RLS + revoke, see the base migration): this
-- security-definer RPC is the only read path, executable by service_role
-- alone. It returns one DEMO-marked transfer plus its events as JSON —
-- no other rows are reachable through it.
create or replace function public.vireo_read_negotiator_ledger(
  p_demo_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_transfer public.vireo_negotiator_transfers%rowtype;
begin
  if p_demo_ref is null
    or p_demo_ref !~ '^DEMO-NEG-[0-9A-Za-z-]{1,60}$'
  then
    raise exception 'invalid demo ref';
  end if;
  select t.* into v_transfer
  from public.vireo_negotiator_transfers t
  where t.demo_ref = p_demo_ref;
  if not found then
    return jsonb_build_object('transfer', null, 'events', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'transfer', to_jsonb(v_transfer),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.received_at, e.occurred_at)
      from public.vireo_negotiator_events e
      where e.transfer_id = v_transfer.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all
  on function public.vireo_read_negotiator_ledger(text)
  from public, anon, authenticated;
grant execute
  on function public.vireo_read_negotiator_ledger(text)
  to service_role;
