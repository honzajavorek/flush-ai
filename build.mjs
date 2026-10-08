import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { minify } from 'terser';

const source = await readFile('src/flush-ai.js', 'utf8');
const { code } = await minify(`(()=>{${source}})()`, {
  compress: true,
  mangle: true,
  format: { comments: false },
});
const bookmarklet = `javascript:${encodeURIComponent(code)}`;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>flush-ai</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    .bookmarklet { display: inline-block; padding: .6rem 1.2rem; background: #c33; color: #fff; border-radius: .4rem; text-decoration: none; font-weight: 600; }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; font-size: .85rem; }
  </style>
</head>
<body>
  <h1>flush-ai 🚽</h1>
  <p>Click the button while in an AI chat interface and it goes through your past sessions and deletes them all, except the pinned ones. Supported chats: ChatGPT (incl. Codex tasks), Claude.</p>
  <p>Drag this button to your bookmarks bar:</p>
  <p><a class="bookmarklet" href="${escapeHtml(bookmarklet)}">Flush AI</a></p>
  <h2>Source</h2>
  <p>On GitHub: <a href="https://github.com/honzajavorek/flush-ai">honzajavorek/flush-ai</a></p>
  <pre><code>${escapeHtml(source)}</code></pre>
</body>
</html>
`;

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log(`Built dist/index.html (bookmarklet: ${bookmarklet.length} chars)`);
