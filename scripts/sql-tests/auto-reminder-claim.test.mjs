// Réservation unique des relances auto (migration 202611111000).
// Schéma minimal autonome : agences, projets, checklist, logs de relance.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const mig = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const db = new PGlite()

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE public.agencies (
    id uuid PRIMARY KEY,
    auto_reminders_enabled boolean DEFAULT true,
    auto_reminders_delay_hours integer,
    ai_reminder_max_per_project integer,
    ai_reminder_send_hour_start smallint,
    ai_reminder_send_hour_end smallint
  );
  CREATE TABLE public.projects (
    id uuid PRIMARY KEY,
    agency_id uuid REFERENCES public.agencies(id),
    status text DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    last_reminder_sent_at timestamptz,
    last_portal_visit_at timestamptz,
    reminder_cap_reset_at timestamptz,
    client_email text
  );
  CREATE TABLE public.checklist_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.projects(id),
    submitted_at timestamptz
  );
  CREATE TABLE public.project_reminder_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.projects(id),
    agency_id uuid REFERENCES public.agencies(id),
    source text CHECK (source IN ('auto','manual')),
    recipient_email text,
    sent_at timestamptz DEFAULT now(),
    status text CHECK (status IN ('sending','sent','failed'))
  );
  -- Fenêtre d'envoi pilotable par le test.
  CREATE FUNCTION public.is_within_paris_send_window(s smallint, e smallint, t timestamptz)
  RETURNS boolean LANGUAGE sql AS $$
    SELECT coalesce(current_setting('test.in_window', true), 'on') = 'on'
  $$;
  -- Définitions identiques à la prod.
  CREATE FUNCTION public.project_reminder_cap_anchor(p_project_id uuid)
  RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
  DECLARE v_anchor timestamptz; v_max_submitted timestamptz; v_portal timestamptz; v_reset timestamptz;
  BEGIN
    SELECT max(ci.submitted_at) INTO v_max_submitted FROM public.checklist_items ci WHERE ci.project_id = p_project_id;
    SELECT p.last_portal_visit_at, p.reminder_cap_reset_at INTO v_portal, v_reset FROM public.projects p WHERE p.id = p_project_id;
    v_anchor := v_max_submitted;
    IF v_portal IS NOT NULL AND (v_anchor IS NULL OR v_portal > v_anchor) THEN v_anchor := v_portal; END IF;
    IF v_reset IS NOT NULL AND (v_anchor IS NULL OR v_reset > v_anchor) THEN v_anchor := v_reset; END IF;
    RETURN v_anchor;
  END; $$;
  CREATE FUNCTION public.project_consecutive_auto_reminders(p_project_id uuid)
  RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT count(*)::integer FROM public.project_reminder_logs l
    WHERE l.project_id = p_project_id AND l.source = 'auto' AND l.status IN ('sent', 'sending')
      AND (public.project_reminder_cap_anchor(p_project_id) IS NULL
           OR l.sent_at > public.project_reminder_cap_anchor(p_project_id));
  $$;
  -- Ancienne signature, supprimée par la migration.
  CREATE FUNCTION public.claim_auto_reminder(p_project_id uuid)
  RETURNS TABLE (ok boolean, log_id uuid, error_code text) LANGUAGE sql AS $$
    SELECT false, NULL::uuid, 'old'::text
  $$;
`)
await db.exec(mig('202611111000_auto_reminder_fallback_claim.sql'))

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++
    console.log('  ✓', name)
  } else {
    fail++
    console.log('  ✗', name, extra)
  }
}

const AG = 'aaaaaaaa-0000-0000-0000-000000000001'
let n = 0
async function project({ createdHoursAgo = 100, lastReminderHoursAgo = null, portalHoursAgo = null } = {}) {
  n += 1
  const id = `dddddddd-0000-0000-0000-${String(n).padStart(12, '0')}`
  await db.query(
    `INSERT INTO projects (id, agency_id, created_at, last_reminder_sent_at, last_portal_visit_at, client_email)
     VALUES ($1, $2, now() - make_interval(hours => $3),
             CASE WHEN $4::int IS NULL THEN NULL ELSE now() - make_interval(hours => $4::int) END,
             CASE WHEN $5::int IS NULL THEN NULL ELSE now() - make_interval(hours => $5::int) END,
             'client@example.test')`,
    [id, AG, createdHoursAgo, lastReminderHoursAgo, portalHoursAgo],
  )
  return id
}
const claim = async (id, grace) =>
  (
    await db.query(
      grace === undefined
        ? 'SELECT * FROM claim_auto_reminder($1)'
        : 'SELECT * FROM claim_auto_reminder($1, $2)',
      grace === undefined ? [id] : [id, grace],
    )
  ).rows[0]
const log = (id, status, hoursAgo) =>
  db.query(
    `INSERT INTO project_reminder_logs (project_id, agency_id, source, sent_at, status)
     VALUES ($1, $2, 'auto', now() - ($3::float8 * interval '1 hour'), $4)`,
    [id, AG, hoursAgo, status],
  )

await db.query('INSERT INTO agencies (id) VALUES ($1)', [AG])

console.log('Signature')
{
  const fns = (
    await db.query(
      "SELECT pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p WHERE proname = 'claim_auto_reminder'",
    )
  ).rows
  ok('une seule signature (uuid, integer)', fns.length === 1 && fns[0].args.includes('integer'), JSON.stringify(fns))
  const exec = (
    await db.query(
      "SELECT has_function_privilege('authenticated', 'public.claim_auto_reminder(uuid, integer)', 'execute') AS a, has_function_privilege('service_role', 'public.claim_auto_reminder(uuid, integer)', 'execute') AS s",
    )
  ).rows[0]
  ok('réservé au service_role', exec.a === false && exec.s === true, JSON.stringify(exec))
}

console.log('Délai et grâce')
{
  const due = await project({ createdHoursAgo: 60 })
  const r = await claim(due)
  ok('projet dû (60h > 48h) : réservé sans grâce', r.ok === true && r.log_id)
  const again = await claim(due)
  ok('2e réservation immédiate refusée (anti-doublon)', again.ok === false && again.error_code === 'already_claiming', JSON.stringify(again))

  const early = await project({ createdHoursAgo: 30 })
  const r2 = await claim(early)
  ok('projet pas encore dû (30h) refusé', r2.ok === false && r2.error_code === 'delay_not_elapsed')

  const p60 = await project({ createdHoursAgo: 60 })
  const g = await claim(p60, 24)
  ok('grâce 24h : 60h < 72h → refusé', g.ok === false && g.error_code === 'delay_not_elapsed', JSON.stringify(g))
  const p80 = await project({ createdHoursAgo: 80 })
  const g2 = await claim(p80, 24)
  ok('grâce 24h : 80h > 72h → réservé', g2.ok === true)
  const neg = await project({ createdHoursAgo: 60 })
  const g3 = await claim(neg, -10)
  ok('grâce négative traitée comme 0', g3.ok === true)
}

console.log('Relance récente bloque (IA ou classique, même journal)')
{
  const p = await project({ createdHoursAgo: 200 })
  await log(p, 'sent', 10)
  const r = await claim(p)
  ok('relance envoyée il y a 10h → refus', r.ok === false && r.error_code === 'delay_not_elapsed')
  const m = await project({ createdHoursAgo: 200, lastReminderHoursAgo: 5 })
  const r2 = await claim(m)
  ok('relance manuelle il y a 5h → refus', r2.ok === false && r2.error_code === 'delay_not_elapsed')
}

console.log('Réservations orphelines')
{
  const p = await project({ createdHoursAgo: 200 })
  await log(p, 'sending', 3)
  const r = await claim(p)
  ok('réservation "sending" de 3h libérée puis nouvelle réservation', r.ok === true, JSON.stringify(r))
  const freed = (
    await db.query(
      "SELECT count(*)::int AS c FROM project_reminder_logs WHERE project_id = $1 AND status = 'failed'",
      [p],
    )
  ).rows[0].c
  ok('ancienne réservation passée en failed', freed === 1)

  const q = await project({ createdHoursAgo: 200 })
  await log(q, 'sending', 0.2)
  const r2 = await claim(q)
  ok('réservation récente (12 min) toujours respectée', r2.ok === false && r2.error_code === 'already_claiming')
}

console.log('Plafond et fenêtre')
{
  const p = await project({ createdHoursAgo: 900 })
  await log(p, 'sent', 400)
  await log(p, 'sent', 300)
  await log(p, 'sent', 200)
  const r = await claim(p)
  ok('3 relances consécutives → plafond', r.ok === false && r.error_code === 'cap_reached')

  const w = await project({ createdHoursAgo: 100 })
  await db.exec("SET test.in_window = 'off'")
  const r2 = await claim(w)
  await db.exec("SET test.in_window = 'on'")
  ok('hors plage horaire → refus', r2.ok === false && r2.error_code === 'outside_send_window')

  await db.query("UPDATE agencies SET auto_reminders_enabled = false WHERE id = $1", [AG])
  const r3 = await claim(w)
  await db.query("UPDATE agencies SET auto_reminders_enabled = true WHERE id = $1", [AG])
  ok('relances auto désactivées → refus', r3.ok === false && r3.error_code === 'auto_disabled')
}

console.log(`\n${pass} ok, ${fail} échec(s)`)
if (fail > 0) process.exit(1)
