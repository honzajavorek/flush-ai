# flush-ai 🚽
Bookmarklet which deletes all your AI chat sessions except the pinned ones.

Click the button while in an AI chat interface and it goes through your past sessions and deletes them all, except the pinned ones. Supported chats: ChatGPT (incl. Codex tasks), Claude.

**Install:** open https://honzajavorek.github.io/flush-ai/ and drag the button to your bookmarks bar.

## How it works

- Runs in the page and uses the chat's own internal API with your logged-in session.
- **Claude:** lists all chats, keeps starred ones, deletes the rest.
- **ChatGPT:** lists all chats and Codex tasks, keeps pinned ones, deletes the rest. If a chat can't be deleted, it's hidden instead.
- Asks for confirmation first, then deletes one by one (800 ms apart) and shows a summary. Details are logged to the browser console.
- Deletion can't be undone.

## Development

Edit `src/flush-ai.js`. On push to `main`, GitHub Actions minifies it into a bookmarklet and publishes a page with a draggable link to GitHub Pages.

Build locally with `npm install && npm run build`, then open `dist/index.html`.

One-time setup: in the repo **Settings → Pages**, set **Source** to **GitHub Actions**.
