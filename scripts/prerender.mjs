/**
 * Prerender des routes marketing après `vite build`.
 *
 * 1. Compile src/entry-prerender.tsx en bundle SSR (dist-ssr/)
 * 2. Rend chaque route en HTML statique (contenu + balises head par route)
 * 3. Écrit dist/index.html et dist/<route>/index.html
 *
 * Les crawlers reçoivent ainsi le contenu complet sans exécuter de JS.
 * Au runtime, React remonte sur la page normalement (createRoot.render).
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const ssrDir = join(root, 'dist-ssr')

/** Marqueur de contenu attendu par route — le build échoue s'il est absent. */
const CONTENT_MARKERS = {
  '/': 'Onboarder un client',
  '/demo': 'Réservez votre démo',
  '/a-propos': 'À propos de Freli',
  '/faq': 'Questions fréquentes',
  '/mentions-legales': 'Mentions légales',
  '/confidentialite': 'Politique de confidentialité',
  '/conditions-utilisation': "Conditions d'utilisation",
}

console.log('[prerender] build SSR entry…')
execSync('npx vite build --config vite.prerender.config.ts', { cwd: root, stdio: 'inherit' })

const entryUrl = pathToFileURL(join(ssrDir, 'entry-prerender.js')).href
const { prerenderPaths, renderBody, renderHead } = await import(entryUrl)

const template = readFileSync(join(distDir, 'index.html'), 'utf8')

/** Retire du template les balises SEO par défaut (remplacées par route). */
function stripDefaultSeoTags(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, '')
    .replace(/<link rel="canonical"[^>]*\/>/, '')
    .replace(/<meta\s+property="og:[\s\S]*?\/>/g, '')
    .replace(/<meta\s+name="twitter:[\s\S]*?\/>/g, '')
}

const strippedTemplate = stripDefaultSeoTags(template)

if (!strippedTemplate.includes('<div id="root"></div>')) {
  throw new Error('[prerender] <div id="root"></div> introuvable dans dist/index.html')
}

for (const path of prerenderPaths) {
  const body = renderBody(path)
  const head = renderHead(path)

  const html = strippedTemplate
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

  const marker = CONTENT_MARKERS[path]
  if (marker && !html.includes(marker)) {
    throw new Error(`[prerender] contenu attendu absent pour ${path} : « ${marker} »`)
  }

  const outFile = path === '/' ? join(distDir, 'index.html') : join(distDir, path.slice(1), 'index.html')
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, html)
  console.log(`[prerender] ${path} → ${outFile.replace(`${root}/`, '')} (${(html.length / 1024).toFixed(1)} Ko)`)
}

rmSync(ssrDir, { recursive: true, force: true })
console.log(`[prerender] OK — ${prerenderPaths.length} routes prerendues.`)
