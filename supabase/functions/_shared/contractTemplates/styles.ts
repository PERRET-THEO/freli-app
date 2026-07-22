/** Styles CSS — template document professionnel v2 (proposition / contrat). */

export function buildContractStyles(vars: {
  accent: string
  accentSoft: string
  layoutOverrides?: string
}): string {
  return `
:root {
  --ink: #1a1d29;
  --ink-soft: #4a4f5e;
  --paper: #ffffff;
  --line: #dcdfe6;
  --accent: ${vars.accent};
  --accent-soft: ${vars.accentSoft};
  --gold: #a9812f;
  --gold-soft: #f9f2e2;
  --ok: #2f6b47;
  --no: #a13d3d;
  --warning-bg: #fdf6ec;
  --warning-border: #e8c98a;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: #eef0f2;
  font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.sheet {
  position: relative;
  max-width: 760px;
  margin: 0 auto;
  background: var(--paper);
  padding: 56px 64px 56px 80px;
}

.sheet::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 100%;
  background: linear-gradient(180deg, var(--accent) 0%, var(--gold) 100%);
}

/* ---------- En-tête ---------- */
.letterhead {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 28px;
  margin-bottom: 36px;
  gap: 24px;
}

.letterhead-emitter {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  flex: 1;
  min-width: 0;
}

.letterhead-brand {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.letterhead-logo {
  flex-shrink: 0;
  max-height: 44px;
  max-width: 100px;
  object-fit: contain;
}

.letterhead-emitter .name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink);
}

.letterhead-emitter .meta {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--ink-soft);
  line-height: 1.5;
}

.letterhead-doc {
  text-align: right;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  flex-shrink: 0;
}

.letterhead-doc .doc-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
  font-weight: 700;
}

.letterhead-doc .doc-ref {
  font-size: 13px;
  color: var(--ink-soft);
  margin-top: 4px;
  line-height: 1.5;
}

h1.title {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0 0 6px;
  color: var(--ink);
  line-height: 1.25;
}

.subtitle {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  color: var(--ink-soft);
  margin: 0 0 20px;
}

.intro-line {
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink);
  margin: 0 0 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line);
}

.intro-line em {
  font-style: normal;
  color: var(--accent);
  font-weight: 700;
}

/* ---------- Brouillon IA ---------- */
.ai-generated-notice {
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: 4px;
  padding: 14px 18px;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  color: #6b4d1f;
  line-height: 1.6;
  margin-bottom: 32px;
}

.ai-generated-notice strong {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}

/* ---------- Bloc infos ---------- */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px 32px;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  background: var(--accent-soft);
  border-radius: 4px;
  padding: 24px 28px;
  margin-bottom: 36px;
}

.info-block .label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  font-weight: 700;
  margin-bottom: 6px;
}

.info-block .value {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink);
}

/* ---------- Sections ---------- */
section.clause {
  margin-bottom: 34px;
  page-break-inside: avoid;
}

h2.section-title {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent);
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
  margin: 0 0 16px;
}

section.clause p {
  font-size: 14.5px;
  line-height: 1.75;
  margin: 0 0 12px;
  text-align: justify;
}

section.clause ul,
section.clause ol {
  margin: 0 0 12px;
  padding-left: 22px;
}

section.clause li {
  font-size: 14.5px;
  line-height: 1.7;
  margin-bottom: 6px;
}

h3.sub-title {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  margin: 18px 0 6px;
}

/* ---------- Prix mis en avant ---------- */
.price-highlight {
  display: flex;
  align-items: baseline;
  gap: 14px;
  background: var(--gold-soft);
  border: 1px solid #ecdcb0;
  border-radius: 6px;
  padding: 22px 26px;
  margin-bottom: 20px;
}

.price-highlight .amount {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 40px;
  font-weight: 700;
  color: var(--gold);
  line-height: 1;
}

.price-highlight .amount-label {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 12.5px;
  color: #8a6a24;
  line-height: 1.4;
}

/* ---------- Listes compris / non compris ---------- */
.checklist {
  list-style: none;
  padding-left: 0;
  margin: 0 0 12px;
}

.checklist li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14.5px;
  line-height: 1.6;
  margin-bottom: 9px;
}

.checklist .mark {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  margin-top: 2px;
}

.checklist.included .mark {
  background: #e2efe4;
  color: var(--ok);
}

.checklist.excluded .mark {
  background: #f4e3e3;
  color: var(--no);
}

/* ---------- Récapitulatif financier ---------- */
table.financial-summary {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 13.5px;
  margin-top: 8px;
}

table.financial-summary td {
  padding: 12px 4px;
  border-bottom: 1px solid var(--line);
}

table.financial-summary td:last-child {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

table.financial-summary tr:nth-child(odd) td {
  background: #fafafa;
}

table.financial-summary tr.total td {
  border-bottom: none;
  border-top: 2px solid var(--ink);
  font-weight: 700;
  font-size: 17px;
  color: var(--gold);
  padding-top: 16px;
  background: transparent;
}

/* ---------- Signatures ---------- */
.signature-zone {
  margin-top: 48px;
  padding-top: 32px;
  border-top: 2px solid var(--ink);
  page-break-inside: avoid;
}

.signature-intro {
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 32px;
}

.signature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
}

.signature-box {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  background: #fbfbfc;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.03);
}

.signature-box .who {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  font-weight: 700;
  margin-bottom: 10px;
}

.signature-pad {
  height: 90px;
  border: 1.5px dashed #c7ccd6;
  border-radius: 6px;
  background: var(--paper);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa0ab;
  font-size: 12px;
  margin-bottom: 10px;
  text-align: center;
  padding: 0 8px;
}

.signature-meta {
  font-size: 11.5px;
  color: var(--ink-soft);
}

/* ---------- Pied de page ---------- */
.footer {
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 10.5px;
  color: #9aa0ab;
  line-height: 1.6;
  text-align: center;
}

@page {
  size: A4;
  margin: 16mm 18mm 20mm 18mm;
}

@media print {
  html, body { background: var(--paper); }
  .sheet {
    box-shadow: none;
    margin: 0;
    max-width: none;
    padding: 32px 32px 32px 44px;
  }
  .ai-generated-notice { display: none; }
}

@media (max-width: 640px) {
  .sheet { padding: 32px 24px 32px 36px; }
  .info-grid, .signature-grid { grid-template-columns: 1fr; }
  .letterhead { flex-direction: column; gap: 20px; }
  .letterhead-doc { text-align: left; }
}

${vars.layoutOverrides ?? ''}
`
}
