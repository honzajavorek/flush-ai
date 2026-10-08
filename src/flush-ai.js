const DELAY_MS = 800;

/**
 * Waits for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads a cookie value by name.
 * @param {string} name
 * @returns {string | undefined}
 */
function getCookie(name) {
  return document.cookie.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

/**
 * Deletes items one by one, pausing between requests to avoid rate limits.
 * @param {object[]} items
 * @param {(item: object) => Promise<Response>} deleteItem
 * @param {string} label Prefix for console log lines
 * @returns {Promise<[number, number]>} Counts of succeeded and failed deletions
 */
async function deleteAll(items, deleteItem, label) {
  let succeeded = 0;
  let failed = 0;
  for (const item of items) {
    const response = await deleteItem(item);
    if (response.ok) {
      succeeded++;
    } else {
      failed++;
    }
    console.log(label, item.id || item.uuid, item.title || item.name, response.status);
    await sleep(DELAY_MS);
  }
  return [succeeded, failed];
}

/**
 * Finds the ID of the current Claude organization.
 * @returns {Promise<string | undefined>}
 */
async function getClaudeOrgId() {
  const orgId = getCookie('lastActiveOrg');
  if (orgId) return orgId;
  const orgs = await (await fetch('/api/organizations')).json();
  return orgs[0]?.uuid;
}

/**
 * Deletes all Claude chats except the starred ones.
 * @param {string} orgId
 */
async function flushClaude(orgId) {
  alert('Starting – collecting Claude chats…');

  const conversationsUrl = `/api/organizations/${orgId}/chat_conversations`;

  const PAGE_SIZE = 100;
  const conversations = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetch(`${conversationsUrl}?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!response.ok) {
      console.warn('list', response.status);
      break;
    }
    const page = await response.json();
    conversations.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const toDelete = conversations.filter((conversation) => !conversation.is_starred);
  const skipped = conversations.length - toDelete.length;
  if (!toDelete.length) {
    alert(`Nothing to delete (found ${conversations.length})`);
    return;
  }
  if (!confirm(`Delete ${toDelete.length} Claude chats?\nSkipping ${skipped} starred.\n\nThis cannot be undone.`)) {
    return;
  }

  const [succeeded, failed] = await deleteAll(
    toDelete,
    (conversation) => fetch(`${conversationsUrl}/${conversation.uuid}`, { method: 'DELETE' }),
    'claude',
  );
  alert(`Deleted ${succeeded}, failed ${failed}, skipped ${skipped} starred.`);
}

/**
 * Reads IDs of the Claude Code sessions pinned in the sidebar.
 * @param {string} orgId
 * @returns {Promise<Set<string>>}
 */
async function getPinnedClaudeCodeSessionIds(orgId) {
  const response = await fetch(`/api/claude_code/organizations/${orgId}/user_settings`);
  if (!response.ok) throw new Error(`Could not read pinned sessions (HTTP ${response.status})`);
  const entries = (await response.json()).content?.entries;
  if (!entries || typeof entries !== 'object') throw new Error('Could not read pinned sessions (unexpected format)');
  const entry = entries['ccd/dframe-starred-code'];
  if (entry === undefined) return new Set();
  const starredIds = JSON.parse(entry).state?.starredIds;
  if (!Array.isArray(starredIds)) throw new Error('Could not read pinned sessions (unexpected format)');
  return new Set(starredIds);
}

/**
 * Deletes all Claude Code sessions, including archived ones, except the pinned ones.
 * @param {string} orgId
 */
async function flushClaudeCode(orgId) {
  alert('Starting – collecting Claude Code sessions…');

  // Fails rather than returning nothing, so pinned sessions never get deleted by accident
  const pinnedIds = await getPinnedClaudeCodeSessionIds(orgId);

  const headers = {
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'x-organization-uuid': orgId,
  };
  const sessions = new Map();
  for (const statuses of ['statuses=active&statuses=paused', 'statuses=archived']) {
    let resumeToken = null;
    do {
      const tokenParam = resumeToken ? `&resume_token=${encodeURIComponent(resumeToken)}` : '';
      const response = await fetch(`/v1/code/sessions?${statuses}&limit=100${tokenParam}`, { headers });
      if (!response.ok) throw new Error(`Could not list sessions (HTTP ${response.status})`);
      const data = await response.json();
      const page = data.data || [];
      const sizeBefore = sessions.size;
      page.forEach((session) => sessions.set(session.id, session));
      // Stops when a page brings nothing new, in case the token doesn't advance
      resumeToken = page.length && sessions.size > sizeBefore ? data.resume_token : null;
    } while (resumeToken);
  }

  const allSessions = [...sessions.values()];
  const toDelete = allSessions.filter((session) => !pinnedIds.has(session.id));
  const skipped = allSessions.length - toDelete.length;
  if (!toDelete.length) {
    alert(`Nothing to delete (found ${allSessions.length})`);
    return;
  }
  if (!confirm(`Delete ${toDelete.length} Claude Code sessions?\nSkipping ${skipped} pinned.\n\nThis cannot be undone.`)) {
    return;
  }

  const [succeeded, failed] = await deleteAll(
    toDelete,
    (session) => fetch(`/v1/code/sessions/${session.id}`, { method: 'DELETE', headers, body: '{}' }),
    'claude code',
  );
  alert(`Deleted ${succeeded}, failed ${failed}, skipped ${skipped} pinned.`);
}

/**
 * Deletes all ChatGPT chats and Codex tasks except the pinned ones.
 */
async function flushChatGPT() {
  alert('Starting – collecting chats and tasks…');

  // Codex tasks don't reliably expose pinned state in the API, so also read it from the sidebar
  const pinnedInSidebar = new Set(
    [...document.querySelectorAll('[data-app-action-sidebar-thread-pinned="true"]')]
      .map((element) => (element.dataset.appActionSidebarThreadId || '').split(':').pop()),
  );
  const isChatPinned = (chat) => Boolean(chat.pinned_time || chat.is_starred);
  const isTaskPinned = (task) =>
    pinnedInSidebar.has(task.id) ||
    Object.keys(task).some((key) => /pin|star/i.test(key) && task[key] && task[key] !== 'false');

  const session = await (await fetch('/api/auth/session')).json();
  if (!session.accessToken) {
    alert('Not logged in');
    return;
  }
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const accountId = session.account?.id || getCookie('_account');
  if (accountId) headers['ChatGPT-Account-ID'] = accountId;
  const deviceId = getCookie('oai-did');
  if (deviceId) headers['oai-device-id'] = deviceId;

  const CHATS_PAGE_SIZE = 28;
  const chats = [];
  for (let offset = 0; ; offset += CHATS_PAGE_SIZE) {
    const response = await fetch(
      `/backend-api/conversations?offset=${offset}&limit=${CHATS_PAGE_SIZE}&order=updated`,
      { headers },
    );
    if (!response.ok) {
      console.warn('chat list', response.status);
      break;
    }
    const page = (await response.json()).items || [];
    chats.push(...page);
    if (page.length < CHATS_PAGE_SIZE) break;
  }

  const tasks = [];
  let cursor = null;
  do {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const response = await fetch(`/backend-api/wham/tasks/list?limit=20&task_filter=all${cursorParam}`, { headers });
    if (!response.ok) {
      console.warn('task list', response.status);
      break;
    }
    const data = await response.json();
    tasks.push(...(data.items || []));
    cursor = data.items?.length ? data.cursor : null;
  } while (cursor);

  const chatsToDelete = chats.filter((chat) => !isChatPinned(chat));
  const tasksToDelete = tasks.filter((task) => !isTaskPinned(task));
  const skipped = chats.length + tasks.length - chatsToDelete.length - tasksToDelete.length;
  if (!chatsToDelete.length && !tasksToDelete.length) {
    alert(`Nothing to delete (found ${chats.length} chats, ${tasks.length} tasks)`);
    return;
  }
  if (!confirm(`Delete ${chatsToDelete.length} chats and ${tasksToDelete.length} Codex tasks?\nSkipping ${skipped} pinned.\n\nThis cannot be undone.`)) {
    return;
  }

  const [chatsSucceeded, chatsFailed] = await deleteAll(
    chatsToDelete,
    (chat) => fetch(`/backend-api/conversation/id/${chat.id}`, { method: 'DELETE', headers }),
    'chat',
  );
  const [tasksSucceeded, tasksFailed] = await deleteAll(
    tasksToDelete,
    (task) => fetch(`/backend-api/wham/tasks/${task.id}`, { method: 'DELETE', headers }),
    'task',
  );
  alert(
    `Deleted ${chatsSucceeded + tasksSucceeded}, failed ${chatsFailed + tasksFailed}, skipped ${skipped} pinned.`,
  );
}

/**
 * Runs the flush for the current site and reports any error.
 */
async function main() {
  try {
    if (location.hostname.endsWith('claude.ai')) {
      const orgId = await getClaudeOrgId();
      if (!orgId) {
        alert('No organization found');
        return;
      }
      if (location.pathname.startsWith('/code')) {
        await flushClaudeCode(orgId);
      } else {
        await flushClaude(orgId);
      }
    } else {
      await flushChatGPT();
    }
  } catch (error) {
    alert(`Error: ${error.message}`);
    console.error(error);
  }
}

main();
