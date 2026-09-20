# CIPHER // 2077 — Revenge Next plugin overlay

This archive fixes the earlier Classic/Vendetta-style plugin packaging. It is
for Revenge Next's current plugin repository format.

## Upload these paths to the root of Shmeckle/CIPHER77

- `.github/workflows/cipher-revenge-next.yml`
- `plugins/com.cipher2077.ui/manifest.json`
- `plugins/com.cipher2077.ui/js/index.js`
- `repo.config.json`

Keep your existing root:
- `cipher-2077.json`
- `rajdhani.json`

Delete the OLD root-level plugin files from the previous attempt:
- `manifest.json`
- `index.js`

Do not flatten the new folders. The repository should look like:

CIPHER77/
  .github/
    workflows/
      cipher-revenge-next.yml
  plugins/
    com.cipher2077.ui/
      manifest.json
      js/
        index.js
  cipher-2077.json
  rajdhani.json
  repo.config.json

## What happens after commit

The GitHub Action checks out the current official Revenge plugin template,
places this plugin into it, packages it with the official toolchain, and
publishes a Revenge repository on the `gh-pages` branch.

The action deliberately uses raw.githubusercontent.com as the published base,
so GitHub Pages itself does not need to be enabled.

After the workflow succeeds, the repository base URL is:

https://raw.githubusercontent.com/Shmeckle/CIPHER77/gh-pages

And its index should exist at:

https://raw.githubusercontent.com/Shmeckle/CIPHER77/gh-pages/index.json

The built artifact should be under:

https://raw.githubusercontent.com/Shmeckle/CIPHER77/gh-pages/pool/

## Updating the plugin later

Revenge's repository format treats a version as immutable. Whenever
`plugins/com.cipher2077.ui/js/index.js` changes, bump the `version` in that
plugin's manifest (0.1.0 -> 0.1.1 -> 0.1.2, etc.) before committing.
