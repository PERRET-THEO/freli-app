import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const MIGRATION = process.argv[2] ?? new URL('../../supabase/migrations/202611011900_sales_documents.sql', import.meta.url)
const db = new PGlite()
await db.exec(readFileSync(new URL('./supabase-stub.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(MIGRATION, 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/202611011910_sales_documents_hardening.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/202611012030_sales_documents_clone_defaults.sql', import.meta.url), 'utf8'))
// Lien devis/projet/paiement : modifie sales_document_lock_for_member (non-régression).
await db.exec(readFileSync(new URL('../../supabase/migrations/202611021100_quote_project_invoice.sql', import.meta.url), 'utf8'))

const A = '11111111-0000-0000-0000-000000000001' // owner agence Alpha
const M = '33333333-0000-0000-0000-000000000003' // membre agence Alpha
const B = '22222222-0000-0000-0000-000000000002' // owner agence Beta
const AG_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const AG_B = 'aaaaaaaa-0000-0000-0000-000000000002'
const CL_A = 'cccccccc-0000-0000-0000-000000000001'
const CL_B = 'cccccccc-0000-0000-0000-000000000002'
const PR_A = 'dddddddd-0000-0000-0000-000000000001'

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
    if (user === 'anon') {
      await tx.exec('SET LOCAL ROLE anon')
    } else {
      await tx.exec('SET LOCAL ROLE authenticated')
      await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user])
    }
    return tx.query(sql, params)
  })
}
async function rows(user, sql, params) {
  return (await as(user, sql, params)).rows
}
async function err(user, sql, params) {
  try {
    await as(user, sql, params)
    return null
  } catch (e) {
    return e.message
  }
}
const one = async (user, sql, params) => (await rows(user, sql, params))[0]

console.log('Création & champs protégés')
const q1 = await one(
  A,
  `INSERT INTO sales_documents (agency_id, kind, client_id, project_id, title, status, number, total_ttc, subtotal_ht)
   VALUES ($1,'quote',$2,$3,'Refonte site','paid','FAC-1',999,999) RETURNING *`,
  [AG_A, CL_A, PR_A],
)
ok('insert devis brouillon', q1 && q1.status === 'draft')
ok('statut/numéro/totaux forgés ignorés', q1.number === null && Number(q1.total_ttc) === 0)
ok('created_by = auth.uid()', q1.created_by === A)

ok(
  'avoir direct interdit',
  /avoir/i.test(
    (await err(A, `INSERT INTO sales_documents (agency_id, kind) VALUES ($1,'credit_note')`, [AG_A])) ?? '',
  ),
)
ok(
  'insert dans une autre agence interdit',
  (await err(A, `INSERT INTO sales_documents (agency_id, kind) VALUES ($1,'quote')`, [AG_B])) !== null,
)
ok(
  'client d’une autre agence interdit',
  /Client introuvable/.test(
    (await err(A, `INSERT INTO sales_documents (agency_id, kind, client_id) VALUES ($1,'quote',$2)`, [AG_A, CL_B])) ?? '',
  ),
)

console.log('Lignes & totaux')
await as(
  A,
  `INSERT INTO sales_document_lines (document_id, agency_id, description) VALUES ($1,$2,'forgée')`,
  [q1.id, AG_B],
)
let lines = await rows(A, 'SELECT * FROM sales_document_lines WHERE document_id=$1', [q1.id])
ok('agency_id de ligne forcée sur celle du document', lines.length === 1 && lines[0].agency_id === AG_A)
await as(A, 'DELETE FROM sales_document_lines WHERE document_id=$1', [q1.id])
ok(
  'agence B ne peut pas ajouter de ligne au devis de A',
  (await err(B, `INSERT INTO sales_document_lines (document_id, agency_id, description) VALUES ($1,$2,'x')`, [q1.id, AG_B])) !== null,
)

await as(
  A,
  `INSERT INTO sales_document_lines (document_id, agency_id, position, description, quantity, unit_price_ht, vat_rate, discount_percent)
   VALUES ($1,$2,0,'Design',3,450,20,0),($1,$2,1,'Formation',2,199.99,10,10),($1,$2,2,'Livre',1,25,5.5,0)`,
  [q1.id, AG_A],
)
let d = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [q1.id])
// 1350 + 359.98 (2*199.99*0.9=359.982) + 25 = 1734.98 ; TVA 270 + 36.00 + 1.38 = 307.38
ok('sous-total HT', Number(d.subtotal_ht) === 1734.98, d.subtotal_ht)
ok('TVA par taux', Number(d.total_vat) === 307.38, d.total_vat)
ok('TTC', Number(d.total_ttc) === 2042.36, d.total_ttc)
ok('ventilation 3 taux', d.vat_breakdown.length === 3)

await as(A, `UPDATE sales_document_lines SET quantity = 4 WHERE document_id=$1 AND position=0`, [q1.id])
d = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [q1.id])
ok('totaux recalculés après modif ligne', Number(d.subtotal_ht) === 2184.98, d.subtotal_ht)
await as(A, `DELETE FROM sales_document_lines WHERE document_id=$1 AND position=2`, [q1.id])
d = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [q1.id])
ok('totaux recalculés après suppression', Number(d.subtotal_ht) === 2159.98, d.subtotal_ht)

await as(A, `UPDATE sales_documents SET vat_exempt = true, vat_exemption_reason='TVA non applicable, art. 293 B du CGI' WHERE id=$1`, [q1.id])
d = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [q1.id])
ok('exonération TVA → TVA 0', Number(d.total_vat) === 0 && Number(d.total_ttc) === 2159.98)
await as(A, `UPDATE sales_documents SET vat_exempt = false, vat_exemption_reason=null WHERE id=$1`, [q1.id])
d = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [q1.id])
ok('retour TVA', Number(d.total_vat) === 396.00, d.total_vat)

ok(
  'totaux non modifiables par le client',
  (await err(A, `UPDATE sales_documents SET total_ttc = 1 WHERE id=$1`, [q1.id])) !== null,
)
ok(
  'statut non modifiable en direct',
  (await err(A, `UPDATE sales_documents SET status='accepted' WHERE id=$1`, [q1.id])) !== null,
)
ok(
  'GUC forgée par authenticated ignorée',
  (await err(
    A,
    `SELECT set_config('freli.sales_rpc','on',true); UPDATE sales_documents SET status='sent', number='X' WHERE id='${q1.id}'`,
  )) !== null,
)
ok(
  'quantité négative refusée',
  (await err(A, `UPDATE sales_document_lines SET quantity=-1 WHERE document_id=$1`, [q1.id])) !== null,
)
ok(
  'taux TVA invalide refusé',
  (await err(A, `UPDATE sales_document_lines SET vat_rate=19.6 WHERE document_id=$1`, [q1.id])) !== null,
)

console.log('Isolation multi-agence')
ok('agence B ne voit rien', (await rows(B, 'SELECT * FROM sales_documents')).length === 0)
ok('agence B ne voit pas les lignes', (await rows(B, 'SELECT * FROM sales_document_lines')).length === 0)
await as(B, `UPDATE sales_documents SET title='hack' WHERE id=$1`, [q1.id])
ok('agence B ne modifie pas', (await one(A, 'SELECT title FROM sales_documents WHERE id=$1', [q1.id])).title === 'Refonte site')
ok('agence B ne finalise pas', /introuvable/.test((await err(B, 'SELECT finalize_sales_document($1)', [q1.id])) ?? ''))
ok('anon ne lit rien', (await err('anon', 'SELECT * FROM sales_documents')) !== null)
ok('anon ne peut pas appeler la RPC', (await err('anon', 'SELECT finalize_sales_document($1)', [q1.id])) !== null)
ok('membre (non owner) voit le devis', (await rows(M, 'SELECT * FROM sales_documents')).length === 1)
ok('compteurs non lisibles', (await err(A, 'SELECT * FROM sales_document_counters')) !== null ||
  (await rows(A, 'SELECT * FROM sales_document_counters')).length === 0)

console.log('Finalisation')
const empty = await one(A, `INSERT INTO sales_documents (agency_id, kind) VALUES ($1,'invoice') RETURNING id`, [AG_A])
ok('finaliser sans client refusé', /client/i.test((await err(A, 'SELECT finalize_sales_document($1)', [empty.id])) ?? ''))
await as(A, 'UPDATE sales_documents SET client_id=$2 WHERE id=$1', [empty.id, CL_A])
ok('finaliser sans ligne refusé', /ligne/i.test((await err(A, 'SELECT finalize_sales_document($1)', [empty.id])) ?? ''))

const fq = await one(M, 'SELECT * FROM finalize_sales_document($1)', [q1.id])
ok('numéro devis', fq.number === `DEV-${new Date().getFullYear()}-0001`, fq.number)
ok('statut envoyé', fq.status === 'sent')
ok('validité par défaut +30j', fq.valid_until !== null)
ok('instantané émetteur', fq.issuer_snapshot?.siret === '12345678900011')
ok('instantané client', fq.client_snapshot?.company_name === 'Durand SARL')
ok('refinaliser refusé', (await err(A, 'SELECT finalize_sales_document($1)', [q1.id])) !== null)
ok('lignes verrouillées (update)', (await err(A, 'UPDATE sales_document_lines SET quantity=9 WHERE document_id=$1', [q1.id])) !== null)
ok(
  'lignes verrouillées (insert)',
  (await err(A, `INSERT INTO sales_document_lines (document_id, agency_id, description) VALUES ($1,$2,'x')`, [q1.id, AG_A])) !== null,
)
ok('lignes verrouillées (delete)', (await err(A, 'DELETE FROM sales_document_lines WHERE document_id=$1', [q1.id])) !== null)
ok('document verrouillé', (await err(A, `UPDATE sales_documents SET title='x' WHERE id=$1`, [q1.id])) !== null)

console.log('Statuts devis & conversion')
ok('facture : statut accepted interdit', (await err(A, `SELECT set_sales_document_status($1,'accepted')`, [empty.id])) !== null)
let s = await one(A, `SELECT * FROM set_sales_document_status($1,'declined')`, [q1.id])
ok('devis refusé', s.status === 'declined' && s.declined_at)
ok('conversion d’un devis refusé interdite', (await err(A, 'SELECT convert_quote_to_invoice($1)', [q1.id])) !== null)
s = await one(A, `SELECT * FROM set_sales_document_status($1,'sent')`, [q1.id])
ok('retour en attente', s.status === 'sent' && s.declined_at === null)
const inv1 = (await one(A, 'SELECT convert_quote_to_invoice($1) AS id', [q1.id])).id
const inv1d = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [inv1])
ok('facture brouillon créée', inv1d.kind === 'invoice' && inv1d.status === 'draft')
ok('totaux copiés', Number(inv1d.total_ttc) === Number(fq.total_ttc), `${inv1d.total_ttc} vs ${fq.total_ttc}`)
ok('lien source', inv1d.source_document_id === q1.id)
ok('projet conservé', inv1d.project_id === PR_A)
ok('échéance pré-remplie (30 j)', inv1d.due_date !== null)
ok('conditions de paiement pré-remplies', /30 jours/.test(inv1d.payment_terms ?? ''), inv1d.payment_terms)
const qAfter = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [q1.id])
ok('devis accepté + lien facture', qAfter.status === 'accepted' && qAfter.converted_invoice_id === inv1)
ok('conversion idempotente', (await one(A, 'SELECT convert_quote_to_invoice($1) AS id', [q1.id])).id === inv1)
ok('devis converti ne repasse pas en attente', (await err(A, `SELECT set_sales_document_status($1,'sent')`, [q1.id])) !== null)

console.log('Factures : numérotation continue')
await as(A, `UPDATE sales_documents SET due_date = '2000-01-01' WHERE id=$1`, [inv1])
const fi1 = await one(A, 'SELECT * FROM finalize_sales_document($1)', [inv1])
const y = new Date().getFullYear()
ok('FAC-0001', fi1.number === `FAC-${y}-0001`, fi1.number)
ok('date émission = aujourd’hui', fi1.issue_date !== null)
ok('échéance jamais antérieure à l’émission', String(fi1.due_date) >= String(fi1.issue_date) || new Date(fi1.due_date) >= new Date(fi1.issue_date))
await as(A, `INSERT INTO sales_document_lines (document_id, agency_id, description, quantity, unit_price_ht) VALUES ($1,$2,'Maintenance',1,100)`, [empty.id, AG_A])
const fi2 = await one(A, 'SELECT * FROM finalize_sales_document($1)', [empty.id])
ok('FAC-0002 (sans trou)', fi2.number === `FAC-${y}-0002`, fi2.number)
const draftB = await one(B, `INSERT INTO sales_documents (agency_id, kind, client_id) VALUES ($1,'invoice',$2) RETURNING id`, [AG_B, CL_B])
await as(B, `INSERT INTO sales_document_lines (document_id, agency_id, description, quantity, unit_price_ht) VALUES ($1,$2,'X',1,10)`, [draftB.id, AG_B])
const fb = await one(B, 'SELECT * FROM finalize_sales_document($1)', [draftB.id])
ok('séquence indépendante par agence', fb.number === `FAC-${y}-0001`, fb.number)

ok('facture émise non supprimable', (await rows(A, 'DELETE FROM sales_documents WHERE id=$1 RETURNING id', [inv1])).length === 0)
ok('facture émise toujours là', (await rows(A, 'SELECT id FROM sales_documents WHERE id=$1', [inv1])).length === 1)

console.log('Paiement')
s = await one(A, `SELECT * FROM set_sales_document_status($1,'paid')`, [inv1])
ok('payée', s.status === 'paid' && s.paid_at)
s = await one(A, `SELECT * FROM set_sales_document_status($1,'sent')`, [inv1])
ok('annulation du paiement', s.status === 'sent' && s.paid_at === null)
ok('statut inconnu refusé', (await err(A, `SELECT set_sales_document_status($1,'cancelled')`, [inv1])) !== null)

console.log('Avoirs')
ok('avoir depuis brouillon refusé', (await err(A, 'SELECT create_credit_note_from_invoice($1)', [q1.id])) !== null)
const cn = (await one(A, 'SELECT create_credit_note_from_invoice($1) AS id', [inv1])).id
const cnd = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [cn])
ok('avoir brouillon', cnd.kind === 'credit_note' && cnd.status === 'draft' && Number(cnd.total_ttc) === Number(fi1.total_ttc))
ok('avoir idempotent', (await one(A, 'SELECT create_credit_note_from_invoice($1) AS id', [inv1])).id === cn)
const fcn = await one(A, 'SELECT * FROM finalize_sales_document($1)', [cn])
ok('AV-0001', fcn.number === `AV-${y}-0001`, fcn.number)
const invCancelled = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [inv1])
ok('facture annulée par l’avoir', invCancelled.status === 'cancelled' && invCancelled.cancelled_at)
ok('facture annulée : plus de paiement', (await err(A, `SELECT set_sales_document_status($1,'paid')`, [inv1])) !== null)

console.log('Duplication & suppression')
const dup = (await one(A, 'SELECT duplicate_sales_document($1) AS id', [q1.id])).id
const dupd = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [dup])
ok('duplicata brouillon', dupd.kind === 'quote' && dupd.status === 'draft' && dupd.number === null)
ok('duplicata sans lien source', dupd.source_document_id === null)
ok('duplicata de devis : nouvelle date et validité', dupd.issue_date !== null && dupd.valid_until !== null)
{ const n = (await rows(A, 'SELECT * FROM sales_document_lines WHERE document_id=$1', [dup])).length; ok('lignes dupliquées', n === 2, n) }
const dupCn = (await one(A, 'SELECT duplicate_sales_document($1) AS id', [cn])).id
ok('dupliquer un avoir → facture', (await one(A, 'SELECT kind FROM sales_documents WHERE id=$1', [dupCn])).kind === 'invoice')
ok('suppression brouillon', (await rows(A, 'DELETE FROM sales_documents WHERE id=$1 RETURNING id', [dup])).length === 1)
ok('lignes supprimées en cascade', (await rows(A, 'SELECT * FROM sales_document_lines WHERE document_id=$1', [dup])).length === 0)
ok('devis finalisé supprimable', (await rows(A, 'DELETE FROM sales_documents WHERE id=$1 RETURNING id', [q1.id])).length === 1)
ok('facture conserve son devis source à null', (await one(A, 'SELECT source_document_id FROM sales_documents WHERE id=$1', [inv1])).source_document_id === null)

console.log('Paramètres de facturation')
await as(A, `INSERT INTO agency_invoicing_settings (agency_id, payment_terms_days, quote_validity_days, iban) VALUES ($1, 15, 60, 'FR76 1234')`, [AG_A])
ok('B ne lit pas les paramètres de A', (await rows(B, 'SELECT * FROM agency_invoicing_settings')).length === 0)
ok('délai > 60 j refusé (LME)', (await err(A, 'UPDATE agency_invoicing_settings SET payment_terms_days=90 WHERE agency_id=$1', [AG_A])) !== null)
const q2 = await one(A, `INSERT INTO sales_documents (agency_id, kind, client_id) VALUES ($1,'quote',$2) RETURNING id`, [AG_A, CL_A])
await as(A, `INSERT INTO sales_document_lines (document_id, agency_id, description, quantity, unit_price_ht) VALUES ($1,$2,'Audit',1,800)`, [q2.id, AG_A])
const fq2 = await one(A, 'SELECT *, valid_until - issue_date AS validity FROM finalize_sales_document($1)', [q2.id])
ok('validité devis depuis paramètres (60 j)', Number(fq2.validity) === 60, fq2.validity)
ok('IBAN figé dans l’instantané', fq2.issuer_snapshot.iban === 'FR76 1234')
ok('DEV-0002', fq2.number === `DEV-${y}-0002`, fq2.number)

console.log('Suppression d’un client')
await as(A, 'DELETE FROM clients WHERE id=$1', [CL_A])
const orphan = await one(A, 'SELECT * FROM sales_documents WHERE id=$1', [inv1])
ok('facture conservée sans client (instantané intact)', orphan && orphan.client_id === null && orphan.client_snapshot.company_name === 'Durand SARL')

console.log('Ré-application de la migration (idempotence)')
let rerun = null
try { await db.exec(readFileSync(MIGRATION, 'utf8')) } catch (e) { rerun = e.message }
ok('migration rejouable', rerun === null, rerun)

console.log(`\n${pass} réussis, ${fail} échoués`)
process.exit(fail ? 1 : 0)
