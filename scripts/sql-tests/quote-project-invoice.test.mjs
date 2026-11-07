// Lien devis → projet → paiement Stripe → facture (migration 202611021100).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const mig = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const db = new PGlite()
await db.exec(readFileSync(new URL('./supabase-stub.sql', import.meta.url), 'utf8'))
await db.exec(mig('202611011900_sales_documents.sql'))
await db.exec(mig('202611011910_sales_documents_hardening.sql'))
await db.exec(mig('202611012030_sales_documents_clone_defaults.sql'))
await db.exec(mig('202611021100_quote_project_invoice.sql'))
await db.exec(mig('202611021110_invoice_on_project_paid.sql'))
// Comme sur Supabase : le rôle service a tous les droits sur les tables (et contourne la RLS).
await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; ALTER ROLE service_role BYPASSRLS')

const A = '11111111-0000-0000-0000-000000000001'
const B = '22222222-0000-0000-0000-000000000002'
const AG_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const AG_B = 'aaaaaaaa-0000-0000-0000-000000000002'
const CL_A = 'cccccccc-0000-0000-0000-000000000001'
const PR_A = 'dddddddd-0000-0000-0000-000000000001'
const SVC = 'service'

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

async function as(user, sql, params = []) {
  return db.transaction(async (tx) => {
    if (user === SVC) {
      await tx.exec('SET LOCAL ROLE service_role')
      await tx.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
    } else if (user === 'anon') {
      await tx.exec('SET LOCAL ROLE anon')
    } else {
      await tx.exec('SET LOCAL ROLE authenticated')
      await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user])
      await tx.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)")
    }
    return tx.query(sql, params)
  })
}
const rows = async (u, s, p) => (await as(u, s, p)).rows
const one = async (u, s, p) => (await rows(u, s, p))[0]
async function err(u, s, p) {
  try {
    await as(u, s, p)
    return null
  } catch (e) {
    return e.message
  }
}
const sys = (s, p) => db.query(s, p)

await sys(`UPDATE projects SET client_id=$1, price=500 WHERE id=$2`, [CL_A, PR_A])

async function newQuote(projectId, lines) {
  const q = await one(A, `INSERT INTO sales_documents (agency_id, kind, client_id, project_id) VALUES ($1,'quote',$2,$3) RETURNING id`, [AG_A, CL_A, projectId])
  for (const [i, [desc, price, vat]] of lines.entries()) {
    await as(A, `INSERT INTO sales_document_lines (document_id, agency_id, position, description, quantity, unit_price_ht, vat_rate) VALUES ($1,$2,$3,$4,1,$5,$6)`, [q.id, AG_A, i, desc, price, vat])
  }
  await as(A, 'SELECT finalize_sales_document($1)', [q.id])
  return q.id
}
const pay = (projectId, ref, amount) =>
  one(SVC, 'SELECT create_invoice_for_project_payment($1,$2,$3) AS r', [projectId, ref, amount]).then((x) => x.r)

console.log('Devis accepté → prix du projet')
const q1 = await newQuote(PR_A, [['Site', 1000, 20], ['Hébergement', 100, 20]])
ok('devis envoyé : prix inchangé', Number((await sys('SELECT price FROM projects WHERE id=$1', [PR_A])).rows[0].price) === 500)
await as(A, `SELECT set_sales_document_status($1,'accepted')`, [q1])
ok('devis accepté : prix = 1320 TTC', Number((await sys('SELECT price FROM projects WHERE id=$1', [PR_A])).rows[0].price) === 1320)
await as(A, `SELECT set_sales_document_status($1,'sent')`, [q1])
await sys(`UPDATE projects SET price=10 WHERE id=$1`, [PR_A])
await as(A, `SELECT convert_quote_to_invoice($1)`, [q1])
ok('conversion en facture (accepte le devis) : prix = 1320', Number((await sys('SELECT price FROM projects WHERE id=$1', [PR_A])).rows[0].price) === 1320)

console.log('Garde-fous')
ok('authenticated ne peut pas appeler la fonction de paiement', (await err(A, 'SELECT create_invoice_for_project_payment($1,$2,$3)', [PR_A, 'cs_x', 1320])) !== null)
ok('anon ne peut pas appeler la fonction de paiement', (await err('anon', 'SELECT create_invoice_for_project_payment($1,$2,$3)', [PR_A, 'cs_x', 1320])) !== null)
const draftInv = (await sys(`SELECT converted_invoice_id FROM sales_documents WHERE id=$1`, [q1])).rows[0].converted_invoice_id
ok('référence de paiement non modifiable par l’agence', (await err(A, `UPDATE sales_documents SET payment_reference='forge' WHERE id=$1`, [draftInv])) !== null)
ok('référence ignorée à la création par l’agence', (await one(A, `INSERT INTO sales_documents (agency_id, kind, payment_reference) VALUES ($1,'invoice','forge') RETURNING payment_reference`, [AG_A])).payment_reference === null)
ok('membre d’une autre agence toujours refusé', (await err(B, 'SELECT finalize_sales_document($1)', [draftInv])) !== null)

console.log('Paiement Stripe → facture payée depuis le devis')
await sys(`UPDATE projects SET payment_status='paid' WHERE id=$1`, [PR_A])
const r1 = await pay(PR_A, 'cs_test_1', 1320)
ok('statut paid', r1.status === 'paid', JSON.stringify(r1))
ok('réutilise la facture brouillon du devis', r1.invoice_id === draftInv)
const inv1 = (await sys('SELECT * FROM sales_documents WHERE id=$1', [r1.invoice_id])).rows[0]
ok('facture numérotée FAC-', /^FAC-\d{4}-0001$/.test(inv1.number ?? ''), inv1.number)
ok('facture payée avec date', inv1.status === 'paid' && inv1.paid_at !== null)
ok('lignes du devis reprises (2)', Number((await sys('SELECT count(*) FROM sales_document_lines WHERE document_id=$1', [inv1.id])).rows[0].count) === 2)
ok('mention de règlement dans les notes', /Stripe/.test(inv1.notes ?? ''))
ok('référence de paiement enregistrée', inv1.payment_reference === 'cs_test_1')
ok('échéance = date d’émission', String(inv1.due_date) === String(inv1.issue_date))
const r1b = await pay(PR_A, 'cs_test_1', 1320)
ok('rejeu du webhook : idempotent', r1b.status === 'exists' && r1b.invoice_id === inv1.id, JSON.stringify(r1b))
const r1c = await pay(PR_A, 'cs_test_autre', 1320)
ok('second paiement du même projet : pas de doublon', r1c.status === 'skipped', JSON.stringify(r1c))
ok('prix du projet payé non modifié par un nouveau devis accepté', await (async () => {
  const q = await newQuote(PR_A, [['Option', 50, 20]])
  await as(A, `SELECT set_sales_document_status($1,'accepted')`, [q])
  return Number((await sys('SELECT price FROM projects WHERE id=$1', [PR_A])).rows[0].price) === 1320
})())

console.log('Projet sans devis')
const P2 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price, payment_status) VALUES ($1,'Logo',$2,240,'paid') RETURNING id`, [AG_A, CL_A])).rows[0].id
const r2 = await pay(P2, 'cs_test_2', 240)
const inv2 = (await sys('SELECT * FROM sales_documents WHERE id=$1', [r2.invoice_id])).rows[0]
ok('facture payée créée depuis le prix (TVA 20 %)', r2.status === 'paid' && Number(inv2.total_ttc) === 240 && Number(inv2.subtotal_ht) === 200, JSON.stringify(r2))
ok('numérotation continue FAC-0002', /-0002$/.test(inv2.number ?? ''), inv2.number)
ok('libellé = nom du projet', (await sys('SELECT description FROM sales_document_lines WHERE document_id=$1', [inv2.id])).rows[0].description === 'Logo')

const P3 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price) VALUES ($1,'Arrondi',$2,99.99) RETURNING id`, [AG_A, CL_A])).rows[0].id
const r3 = await pay(P3, 'cs_test_3', 99.99)
ok('montant non exprimable en HT exact → brouillon à vérifier', r3.status === 'needs_review' && r3.reason === 'amount_mismatch', JSON.stringify(r3))
ok('brouillon non numéroté', (await sys('SELECT number, status FROM sales_documents WHERE id=$1', [r3.invoice_id])).rows[0].status === 'draft')

console.log('Micro-entreprise sans TVA (sans paramètres enregistrés)')
await sys(`UPDATE agencies SET legal_form='Auto-entrepreneur', vat_number=null WHERE id=$1`, [AG_B])
const CL_B = 'cccccccc-0000-0000-0000-000000000002'
const P4 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price) VALUES ($1,'Coaching',$2,99.99) RETURNING id`, [AG_B, CL_B])).rows[0].id
const r4 = await pay(P4, 'cs_test_4', 99.99)
const inv4 = (await sys('SELECT * FROM sales_documents WHERE id=$1', [r4.invoice_id])).rows[0]
ok('facture payée exonérée (293 B)', r4.status === 'paid' && inv4.vat_exempt === true && /293 B/.test(inv4.vat_exemption_reason ?? '') && Number(inv4.total_ttc) === 99.99, JSON.stringify(r4))
ok('référence de paiement unique par agence (autre agence, même ref autorisée)', (await pay(P4, 'cs_test_1', 99.99)).status !== 'exists')

console.log('Cas ignorés')
const P5 = (await sys(`INSERT INTO projects (agency_id, name, price) VALUES ($1,'Sans client',50) RETURNING id`, [AG_A])).rows[0].id
ok('projet sans client → ignoré', (await pay(P5, 'cs_test_5', 50)).reason === 'no_client')
const P6 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price, amount_type) VALUES ($1,'Acompte',$2,1000,'deposit') RETURNING id`, [AG_A, CL_A])).rows[0].id
ok('acompte → ignoré', (await pay(P6, 'cs_test_6', 300)).reason === 'deposit')
ok('projet inconnu → ignoré', (await pay('dddddddd-0000-0000-0000-00000000ffff', 'cs_x', 10)).reason === 'project_not_found')

console.log('Devis envoyé (non accepté) du même montant')
const P7 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price) VALUES ($1,'Shop',$2,600) RETURNING id`, [AG_A, CL_A])).rows[0].id
const q7 = await newQuote(P7, [['Boutique', 500, 20]])
const r7 = await pay(P7, 'cs_test_7', 600)
ok('facture payée depuis le devis envoyé', r7.status === 'paid', JSON.stringify(r7))
ok('devis passé en accepté et lié', (await sys('SELECT status, converted_invoice_id FROM sales_documents WHERE id=$1', [q7])).rows[0].converted_invoice_id === r7.invoice_id)
const P8 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price) VALUES ($1,'Autre',$2,120) RETURNING id`, [AG_A, CL_A])).rows[0].id
const q8 = await newQuote(P8, [['Prestation', 999, 20]])
const r8 = await pay(P8, 'cs_test_8', 120)
ok('devis envoyé d’un autre montant non utilisé', (await sys('SELECT status FROM sales_documents WHERE id=$1', [q8])).rows[0].status === 'sent' && r8.status === 'paid', JSON.stringify(r8))

console.log('Déclencheur : projet marqué payé par le webhook (rôle service)')
const P9 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price, stripe_checkout_session_id) VALUES ($1,'Webhook',$2,1320,'cs_live_9') RETURNING id`, [AG_A, CL_A])).rows[0].id
const q9 = await newQuote(P9, [['Site', 1000, 20], ['Hébergement', 100, 20]])
await as(A, `SELECT set_sales_document_status($1,'accepted')`, [q9])
await as(SVC, `UPDATE projects SET payment_status='paid', stripe_checkout_session_id=null WHERE id=$1`, [P9])
const inv9 = (await sys(`SELECT * FROM sales_documents WHERE project_id=$1 AND kind='invoice'`, [P9])).rows
ok('facture payée créée automatiquement', inv9.length === 1 && inv9[0].status === 'paid' && Number(inv9[0].total_ttc) === 1320, JSON.stringify(inv9.map((i) => i.status)))
ok('référence = session Stripe', inv9[0]?.payment_reference === 'cs_live_9')
await as(SVC, `UPDATE projects SET payment_status='paid' WHERE id=$1`, [P9])
ok('re-marquage payé : pas de doublon', Number((await sys(`SELECT count(*) FROM sales_documents WHERE project_id=$1 AND kind='invoice'`, [P9])).rows[0].count) === 1)
const P10 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price) VALUES ($1,'Manuel',$2,240) RETURNING id`, [AG_A, CL_A])).rows[0].id
await as(A, `UPDATE projects SET payment_status='paid' WHERE id=$1`, [P10])
ok('marquage par l’agence (non webhook) : pas de facture auto', Number((await sys(`SELECT count(*) FROM sales_documents WHERE project_id=$1`, [P10])).rows[0].count) === 0)
const P11 = (await sys(`INSERT INTO projects (agency_id, name, price) VALUES ($1,'Sans client',80) RETURNING id`, [AG_A])).rows[0].id
const upd = await err(SVC, `UPDATE projects SET payment_status='paid' WHERE id=$1`, [P11])
ok('échec de facturation n’empêche jamais le passage en payé', upd === null && (await sys('SELECT payment_status FROM projects WHERE id=$1', [P11])).rows[0].payment_status === 'paid', upd)
await sys(`CREATE OR REPLACE FUNCTION public.create_invoice_for_project_payment(p_project_id uuid, p_payment_reference text, p_amount numeric) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$`)
const P12 = (await sys(`INSERT INTO projects (agency_id, name, client_id, price) VALUES ($1,'Panne',$2,80) RETURNING id`, [AG_A, CL_A])).rows[0].id
ok('exception interne absorbée', (await err(SVC, `UPDATE projects SET payment_status='paid' WHERE id=$1`, [P12])) === null)
await db.exec(mig('202611021100_quote_project_invoice.sql'))

console.log('Ré-application de la migration')
let rerun = null
try { await db.exec(mig('202611021100_quote_project_invoice.sql')) } catch (e) { rerun = e.message }
ok('migration rejouable', rerun === null, rerun)

console.log(`\n${pass} réussis, ${fail} échoués`)
process.exit(fail ? 1 : 0)
