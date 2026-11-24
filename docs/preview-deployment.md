# Preview deployment

For each pull request opened from a branch in this repository, `.github/workflows/preview.yml` installs dependencies with `npm ci`, runs tests, lint, typecheck, and builds the production bundle. It then deploys `dist/` to a Cloudflare Pages preview and publishes the deployment URL in the GitHub deployment summary.

To enable deployment, create the Pages project and configure these repository settings:

- Secret `CLOUDFLARE_API_TOKEN` with Cloudflare Pages deployment access.
- Secret `CLOUDFLARE_ACCOUNT_ID` for the account that owns the Pages project.
- Repository variable `CLOUDFLARE_PAGES_PROJECT` with the exact Pages project name.

The preview step is skipped until all three values exist. Pull requests from forks never receive deployment credentials. Keep credentials in GitHub secrets, never in `.env`, `VITE_*` variables, or build artifacts.

> **Caution (read before enabling).** `vite.config.ts` bakes the base path `/HEALTHMATE/` into the build, which is correct for GitHub Pages. A Cloudflare Pages preview serves `dist/` from the site root, so a preview built this way will not load its assets correctly until the build base is made configurable for previews. The preview step is skipped unless all three settings above exist, so leaving them unset keeps the default flow unaffected. The GitHub Pages deployment (`deploy.yml`) is the supported path.
