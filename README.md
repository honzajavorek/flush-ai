# flush-ai
Deletes all your AI sessions except of the pinned ones

## Development

Edit `src/flush-ai.js`. On push to `main`, GitHub Actions minifies it into a bookmarklet and publishes a page with a draggable link to GitHub Pages.

Build locally with `npm install && npm run build`, then open `dist/index.html`.

One-time setup: in the repo **Settings → Pages**, set **Source** to **GitHub Actions**.
