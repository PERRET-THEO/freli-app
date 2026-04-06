# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Déploiement (Vercel via Git)

1. **Créer un dépôt distant** (GitHub, etc.) et pousser cette branche :
   ```bash
   git remote add origin https://github.com/VOTRE_USER/VOTRE_REPO.git
   git push -u origin main
   ```
2. **Vercel** : [vercel.com](https://vercel.com) → Add New → Project → importer le dépôt. **Root Directory** : `.` (la racine de ce repo est l’app Frely). Build : `npm run build`, Output : `dist`. Le fichier [`vercel.json`](vercel.json) configure les rewrites SPA pour React Router.
3. **Variables d’environnement** (Production, et Preview si tu veux des previews fonctionnelles) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Puis **Redeploy** (Vite injecte les `VITE_*` au build).
4. **Supabase** → Authentication → URL Configuration : **Site URL** = `https://<projet>.vercel.app` (ou ton domaine). **Redirect URLs** : inclure `https://<projet>.vercel.app/**` (ou les URLs exactes de ton flux auth).
5. **Smoke test** : ouvrir l’URL prod, recharger `/dashboard` et un lien `/p/<token>` ; tester login / signup.
6. **Edge / Stripe** : une fois l’URL HTTPS fixe, définir le secret Supabase `APP_URL` sur cette URL et configurer les webhooks Stripe comme indiqué dans [`.env.example`](.env.example).
