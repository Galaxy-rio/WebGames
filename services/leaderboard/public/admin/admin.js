const $ = (id) => document.getElementById(id);
const pageSize = 20;
const state = {
  games: [],
  activeTab: 'entries',
  selected: new Set(),
  entries: { items: [], total: 0, offset: 0, query: {}, request: 0 },
  players: { items: [], total: 0, offset: 0, query: '', request: 0 },
  gameEditing: null,
  boardEditing: null,
  boardGameId: null,
  authenticated: false,
  catalogRequest: 0,
};
let notificationTimer;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, action, className = 'quiet table-action') {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function notify(message, isError = false) {
  clearTimeout(notificationTimer);
  $('notification').textContent = message;
  $('notification').classList.toggle('is-error', isError);
  $('notification').hidden = false;
  if (!isError)
    notificationTimer = setTimeout(() => {
      $('notification').hidden = true;
    }, 6000);
}

function showFormError(id, message = '') {
  $(id).textContent = message;
  $(id).hidden = !message;
}

function showLogin(message = '') {
  state.authenticated = false;
  state.games = [];
  state.selected.clear();
  state.entries.items = [];
  state.players.items = [];
  state.entries.request++;
  state.players.request++;
  state.catalogRequest++;
  clearTimeout(notificationTimer);
  document
    .querySelectorAll('dialog[open]')
    .forEach((dialog) => dialog.close('cancel'));
  ['entries-body', 'players-body', 'catalog-list'].forEach((id) =>
    $(id).replaceChildren(),
  );
  ['entries-filter', 'players-filter', 'game-form', 'board-form'].forEach(
    (id) => $(id).reset(),
  );
  fillOptions($('filter-game'), [], '全部游戏');
  refreshBoardFilter();
  $('password').value = '';
  $('notification').hidden = true;
  $('app-view').hidden = true;
  $('logout').hidden = true;
  $('initial-loading').hidden = true;
  $('login-view').hidden = false;
  showFormError('login-error', message);
}

async function api(path, options = {}) {
  const { quietUnauthorized = false, ...request } = options;
  let response;
  try {
    response = await fetch(`/api/admin${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...request,
      headers: {
        ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        ...request.headers,
      },
    });
  } catch {
    throw new Error('无法连接服务，请检查网络后重试。');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !quietUnauthorized)
      showLogin('登录已过期，请重新登录。');
    const error = new Error(
      data?.error?.message || `请求失败（${response.status}），请稍后重试。`,
    );
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

function setStatus(kind, message, retry) {
  const node = $(`${kind}-status`);
  node.replaceChildren(element('span', message, 'status-copy'));
  node.classList.toggle('is-error', Boolean(retry));
  node.hidden = false;
  if (retry)
    node.append(
      button('重新加载', () => Promise.resolve(retry()).catch(() => {})),
    );
}

function beginForm(form) {
  const previous = [...form.elements].map((control) => [
    control,
    control.disabled,
  ]);
  previous.forEach(([control]) => {
    control.disabled = true;
  });
  form.setAttribute('aria-busy', 'true');
  return () => {
    previous.forEach(([control, disabled]) => {
      control.disabled = disabled;
    });
    form.removeAttribute('aria-busy');
  };
}

async function confirmAction(title, message, accept = '确认删除') {
  const dialog = $('confirm-dialog');
  if (dialog.open) return false;
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  $('confirm-accept').textContent = accept;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue === 'confirm'),
      { once: true },
    );
    dialog.showModal();
  });
}

function safeWebsite(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function getGame(id) {
  return state.games.find((game) => game.id === id);
}
function getBoard(gameId, id) {
  return getGame(gameId)?.boards?.find((board) => board.id === id);
}

function formatScore(score, board) {
  if (!Number.isFinite(Number(score))) return '—';
  const scale = Number(board?.scoreScale) || 1;
  const decimals = Math.min(6, Math.max(0, Number(board?.decimals) || 0));
  return `${(Number(score) / scale).toFixed(decimals)}${board?.unit || ''}`;
}

function dateCell(value) {
  const cell = element('td', undefined, 'date-cell');
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) {
    cell.textContent = '—';
    return cell;
  }
  cell.append(
    element(
      'span',
      date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    ),
    element('span', date.toLocaleTimeString('zh-CN', { hour12: false })),
  );
  cell.title = date.toISOString();
  return cell;
}

function fillOptions(select, items, placeholder, value = select.value) {
  select.replaceChildren(new Option(placeholder, ''));
  items.forEach((item) => select.add(new Option(item.name, item.id)));
  select.value = items.some((item) => item.id === value) ? value : '';
}

function refreshBoardFilter() {
  const game = getGame($('filter-game').value);
  fillOptions($('filter-board'), game?.boards || [], '全部榜单');
  $('filter-board').disabled = !game;
}

async function loadCatalog() {
  const request = ++state.catalogRequest;
  setStatus('catalog', '正在读取游戏…');
  $('catalog-list').replaceChildren();
  try {
    const data = await api('/games');
    if (!state.authenticated || request !== state.catalogRequest) return;
    state.games = data.games || [];
    fillOptions($('filter-game'), state.games, '全部游戏');
    refreshBoardFilter();
    renderCatalog();
  } catch (error) {
    if (error.status !== 401 && request === state.catalogRequest)
      setStatus('catalog', error.message, loadCatalog);
    throw error;
  }
}

function renderCatalog() {
  const list = $('catalog-list');
  list.replaceChildren();
  $('catalog-status').hidden = state.games.length > 0;
  if (!state.games.length) {
    setStatus('catalog', '还没有游戏，点击“添加游戏”创建第一张榜单。');
    return;
  }
  state.games.forEach((game) => {
    const card = element('article', undefined, 'game-card');
    const heading = element('div', undefined, 'game-card-heading');
    const titleGroup = element('div');
    const title = element('div', undefined, 'game-card-title');
    title.append(
      element('h3', game.name),
      element(
        'span',
        game.enabled ? '已开放' : '已停用',
        `badge${game.enabled ? '' : ' off'}`,
      ),
    );
    titleGroup.append(title, element('p', game.id, 'game-card-id'));
    const actions = element('div', undefined, 'game-card-actions');
    actions.append(
      button('编辑游戏', () => openGame(game)),
      button('＋ 添加榜单', () => openBoard(game)),
    );
    heading.append(titleGroup, actions);
    card.append(heading);
    const boards = element('div', undefined, 'board-list');
    (game.boards || []).forEach((board) => {
      const row = element('div', undefined, 'board-row');
      const text = element('div');
      const boardTitle = element('p', undefined, 'board-title');
      boardTitle.append(
        element('span', board.name),
        element(
          'span',
          board.enabled ? '接受提交' : '已暂停',
          `badge${board.enabled ? '' : ' off'}`,
        ),
      );
      text.append(
        boardTitle,
        element(
          'p',
          `${board.id} · ${board.sortOrder === 'asc' ? '越小越好' : '越大越好'} · ${board.unit || '无单位'} · ${board.decimals} 位小数`,
          'board-details',
        ),
      );
      row.append(
        text,
        button('编辑', () => openBoard(game, board)),
      );
      boards.append(row);
    });
    if (!game.boards?.length)
      boards.append(
        element('p', '还没有榜单，添加后游戏就可以提交成绩。', 'empty-boards'),
      );
    card.append(boards);
    list.append(card);
  });
}

function updateSelection() {
  const count = state.selected.size;
  $('delete-selected').disabled = count === 0;
  $('delete-selected').textContent = count
    ? `删除所选（${count}）`
    : '删除所选';
  $('select-all').checked =
    state.entries.items.length > 0 && count === state.entries.items.length;
  $('select-all').indeterminate =
    count > 0 && count < state.entries.items.length;
}

function updatePagination(kind, loading = false) {
  const page = state[kind];
  const start = page.total ? page.offset + 1 : 0;
  const end = Math.min(page.offset + page.items.length, page.total);
  $(`${kind}-page`).textContent = page.total
    ? `第 ${start}–${end} 条 · 每页 ${pageSize} 条`
    : `每页 ${pageSize} 条`;
  $(`${kind}-prev`).disabled = loading || page.offset === 0;
  $(`${kind}-next`).disabled = loading || page.offset + pageSize >= page.total;
}

async function loadEntries(adjustEmpty = true) {
  const request = ++state.entries.request;
  state.selected.clear();
  state.entries.items = [];
  updateSelection();
  updatePagination('entries', true);
  $('entries-table-wrap').hidden = true;
  setStatus('entries', '正在读取记录…');
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(state.entries.offset),
  });
  for (const [key, value] of Object.entries(state.entries.query))
    if (value) params.set(key, value);
  try {
    const data = await api(`/entries?${params}`);
    if (request !== state.entries.request || !state.authenticated) return;
    state.entries.total = data.total || 0;
    if (adjustEmpty && state.entries.offset > 0 && !data.entries?.length) {
      state.entries.offset = Math.max(
        0,
        Math.floor((state.entries.total - 1) / pageSize) * pageSize,
      );
      return loadEntries(false);
    }
    state.entries.items = data.entries || [];
    $('entries-count').textContent = `共 ${state.entries.total} 条成绩记录`;
    renderEntries();
    updatePagination('entries');
  } catch (error) {
    if (request !== state.entries.request || error.status === 401) return;
    setStatus('entries', error.message, () => loadEntries());
    $('entries-count').textContent = '记录暂时无法加载';
    updatePagination('entries', true);
  }
}

function renderEntries() {
  const body = $('entries-body');
  body.replaceChildren();
  const entries = state.entries.items;
  $('entries-table-wrap').hidden = entries.length === 0;
  $('entries-status').hidden = entries.length > 0;
  if (!entries.length) {
    setStatus('entries', '没有符合条件的成绩记录。');
    return;
  }
  entries.forEach((entry) => {
    const row = element('tr');
    const checkCell = element('td', undefined, 'check-cell');
    const check = element('input');
    check.type = 'checkbox';
    check.dataset.entryId = entry.id;
    check.setAttribute('aria-label', `选择 ${entry.nickname} 的成绩`);
    check.addEventListener('change', () => {
      if (check.checked) state.selected.add(entry.id);
      else state.selected.delete(entry.id);
      updateSelection();
    });
    checkCell.append(check);
    const player = element('td', undefined, 'player-name');
    player.append(element('strong', entry.nickname));
    const website = safeWebsite(entry.website);
    if (website) {
      const link = element('a', website.hostname, 'cell-subtitle');
      link.href = website.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
      link.title = website.href;
      player.append(link);
    }
    const game = element('td');
    const board = getBoard(entry.gameId, entry.boardId);
    game.append(
      element('span', getGame(entry.gameId)?.name || entry.gameId),
      element('span', board?.name || entry.boardId, 'cell-subtitle'),
    );
    const score = element('td', formatScore(entry.score, board), 'score');
    score.title = `存储值：${entry.score}`;
    const metadata = element('td');
    if (entry.metadata && Object.keys(entry.metadata).length) {
      const detail = element('details');
      detail.append(
        element('summary', '查看信息'),
        element(
          'pre',
          typeof entry.metadata === 'string'
            ? entry.metadata
            : JSON.stringify(entry.metadata, null, 2),
        ),
      );
      metadata.append(detail);
    } else metadata.append(element('span', '—', 'muted'));
    const actions = element('td', undefined, 'actions-cell');
    actions.append(
      button(
        '删除',
        () => deleteEntries([entry.id], entry.nickname),
        'quiet table-action danger',
      ),
    );
    row.append(
      checkCell,
      player,
      game,
      score,
      dateCell(entry.updatedAt ?? entry.createdAt),
      metadata,
      actions,
    );
    body.append(row);
  });
  updateSelection();
}

async function deleteEntries(ids, nickname) {
  if (!ids.length) return;
  const message =
    ids.length === 1
      ? `将删除${nickname ? `“${nickname}”的` : '这条'}成绩记录，并从排行榜移除。\n此操作不能撤销，不会解除玩家的昵称绑定。`
      : `将删除选中的 ${ids.length} 条成绩记录，并从排行榜移除。\n此操作不能撤销，不会解除玩家的昵称绑定。`;
  if (!(await confirmAction('删除成绩记录？', message))) return;
  $('entries-panel').setAttribute('aria-busy', 'true');
  $('delete-selected').disabled = true;
  $('entries-body')
    .querySelectorAll('button')
    .forEach((node) => {
      node.disabled = true;
    });
  try {
    const data = await api('/entries/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    if (!state.authenticated) return;
    notify(`已删除 ${data.deleted ?? ids.length} 条成绩记录。`);
    await loadEntries();
  } catch (error) {
    if (error.status !== 401) {
      notify(error.message, true);
      updateSelection();
    }
  } finally {
    $('entries-panel').removeAttribute('aria-busy');
    $('entries-body')
      .querySelectorAll('button')
      .forEach((node) => {
        node.disabled = false;
      });
  }
}

async function loadPlayers(adjustEmpty = true) {
  const request = ++state.players.request;
  state.players.items = [];
  updatePagination('players', true);
  $('players-table-wrap').hidden = true;
  setStatus('players', '正在读取昵称…');
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(state.players.offset),
  });
  if (state.players.query) params.set('q', state.players.query);
  try {
    const data = await api(`/players?${params}`);
    if (request !== state.players.request || !state.authenticated) return;
    state.players.total = data.total || 0;
    if (adjustEmpty && state.players.offset > 0 && !data.players?.length) {
      state.players.offset = Math.max(
        0,
        Math.floor((state.players.total - 1) / pageSize) * pageSize,
      );
      return loadPlayers(false);
    }
    state.players.items = data.players || [];
    $('players-count').textContent = `共 ${state.players.total} 个玩家昵称`;
    renderPlayers();
    updatePagination('players');
  } catch (error) {
    if (request !== state.players.request || error.status === 401) return;
    setStatus('players', error.message, () => loadPlayers());
    $('players-count').textContent = '昵称暂时无法加载';
    updatePagination('players', true);
  }
}

function renderPlayers() {
  const body = $('players-body');
  body.replaceChildren();
  $('players-table-wrap').hidden = state.players.items.length === 0;
  $('players-status').hidden = state.players.items.length > 0;
  if (!state.players.items.length) {
    setStatus('players', '没有符合条件的玩家昵称。');
    return;
  }
  state.players.items.forEach((player) => {
    const row = element('tr');
    const status = element('td');
    status.append(
      element(
        'span',
        player.protected ? '已绑定邮箱' : '未绑定',
        `badge${player.protected ? '' : ' off'}`,
      ),
    );
    const actions = element('td', undefined, 'actions-cell');
    if (player.protected)
      actions.append(
        button(
          '解除绑定',
          (event) => unlockPlayer(player, event.currentTarget),
          'quiet table-action danger',
        ),
      );
    else actions.append(element('span', '—', 'muted'));
    row.append(
      element('td', player.nickname, 'player-name'),
      status,
      dateCell(player.createdAt),
      actions,
    );
    body.append(row);
  });
}

async function unlockPlayer(player, control) {
  if (
    !(await confirmAction(
      '解除昵称邮箱绑定？',
      `将解除“${player.nickname}”的邮箱绑定。\n保留此玩家的成绩记录；这个昵称将不再受原邮箱保护。`,
      '确认解除',
    ))
  )
    return;
  control.disabled = true;
  try {
    await api(`/players/${encodeURIComponent(player.id)}/unlock`, {
      method: 'POST',
    });
    if (!state.authenticated) return;
    notify(`已解除“${player.nickname}”的邮箱绑定，成绩记录已保留。`);
    await loadPlayers();
  } catch (error) {
    if (error.status !== 401) notify(error.message, true);
  } finally {
    control.disabled = false;
  }
}

function openGame(game) {
  if ($('game-form').getAttribute('aria-busy') === 'true') return;
  state.gameEditing = game?.id || null;
  $('game-form').reset();
  $('game-dialog-title').textContent = game ? '编辑游戏' : '添加游戏';
  $('game-id').value = game?.id || '';
  $('game-id').disabled = Boolean(game);
  $('game-name').value = game?.name || '';
  $('game-enabled').checked = game ? Boolean(game.enabled) : true;
  showFormError('game-error');
  $('game-dialog').showModal();
}

function previewFormat() {
  const scale = Number($('board-scale').value);
  const decimals = Number($('board-decimals').value);
  if (!(scale >= 1) || decimals < 0 || decimals > 6) {
    $('board-format-preview').textContent = '';
    return;
  }
  const sample = formatScore(12345, {
    scoreScale: scale,
    decimals,
    unit: $('board-unit').value,
  });
  $('board-format-preview').textContent =
    `显示方式：存储值 ÷ ${scale}。例如存储 12345，页面显示 ${sample}。上下限使用未除以缩放倍数的存储整数。`;
}

function openBoard(game, board) {
  if ($('board-form').getAttribute('aria-busy') === 'true') return;
  state.boardGameId = game.id;
  state.boardEditing = board?.id || null;
  $('board-form').reset();
  $('board-dialog-title').textContent = board ? '编辑榜单' : '添加榜单';
  $('board-game-label').textContent = `${game.name} / ${game.id}`;
  $('board-id').value = board?.id || '';
  $('board-id').disabled = Boolean(board);
  $('board-name').value = board?.name || '';
  $('board-sort').value = board?.sortOrder || 'desc';
  $('board-unit').value = board?.unit || '';
  $('board-scale').value = String(board?.scoreScale ?? 1);
  $('board-decimals').value = String(board?.decimals ?? 0);
  $('board-min').value = String(board?.minScore ?? 0);
  $('board-max').value = String(board?.maxScore ?? 1000000);
  $('board-metadata').value = (board?.metadataFields || []).join(', ');
  $('board-enabled').checked = board ? Boolean(board.enabled) : true;
  showFormError('board-error');
  previewFormat();
  $('board-dialog').showModal();
}

async function activateTab(name, focus = false) {
  state.activeTab = name;
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`${tab.dataset.tab}-panel`).hidden = !active;
    if (active && focus) tab.focus();
  });
  if (name === 'players') await loadPlayers();
  else if (name === 'entries') await loadEntries();
  else if (name === 'catalog') await loadCatalog().catch(() => {});
}

async function showApp() {
  state.authenticated = true;
  $('initial-loading').hidden = true;
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  $('logout').hidden = false;
  state.entries.offset = 0;
  state.entries.query = {};
  state.players.offset = 0;
  state.players.query = '';
  $('entries-filter').reset();
  $('players-filter').reset();
  try {
    await loadCatalog();
  } catch (error) {
    if (error.status !== 401)
      notify(`游戏配置加载失败：${error.message}`, true);
  }
  if (state.authenticated) await activateTab('entries');
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('password').value;
  showFormError('login-error');
  const restore = beginForm(event.currentTarget);
  $('login-button').textContent = '正在登录…';
  try {
    await api('/login', {
      method: 'POST',
      quietUnauthorized: true,
      body: JSON.stringify({ password }),
    });
    $('password').value = '';
    await showApp();
  } catch (error) {
    showFormError('login-error', error.message);
  } finally {
    $('password').value = '';
    $('login-button').textContent = '登录管理页面';
    restore();
  }
});

$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try {
    await api('/logout', { method: 'POST' });
    showLogin();
    $('password').focus();
  } catch (error) {
    if (error.status !== 401) notify(`退出失败：${error.message}`, true);
  } finally {
    $('logout').disabled = false;
  }
});

document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const index = tabs.indexOf(tab);
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (target < 0) return;
    event.preventDefault();
    activateTab(tabs[target].dataset.tab, true);
  });
});

$('filter-game').addEventListener('change', refreshBoardFilter);
$('entries-filter').addEventListener('submit', (event) => {
  event.preventDefault();
  state.entries.query = {
    gameId: $('filter-game').value,
    boardId: $('filter-board').value,
    q: $('filter-nickname').value.trim(),
  };
  state.entries.offset = 0;
  loadEntries();
});
$('entries-reset').addEventListener('click', () => {
  $('entries-filter').reset();
  refreshBoardFilter();
  state.entries.query = {};
  state.entries.offset = 0;
  loadEntries();
});
$('select-all').addEventListener('change', () => {
  state.selected.clear();
  if ($('select-all').checked)
    state.entries.items.forEach((entry) => state.selected.add(entry.id));
  $('entries-body')
    .querySelectorAll('input[type=checkbox]')
    .forEach((check) => {
      check.checked = state.selected.has(check.dataset.entryId);
    });
  updateSelection();
});
$('delete-selected').addEventListener('click', () =>
  deleteEntries([...state.selected]),
);
$('players-filter').addEventListener('submit', (event) => {
  event.preventDefault();
  state.players.query = $('players-query').value.trim();
  state.players.offset = 0;
  loadPlayers();
});
$('players-reset').addEventListener('click', () => {
  $('players-filter').reset();
  state.players.query = '';
  state.players.offset = 0;
  loadPlayers();
});
['entries', 'players'].forEach((kind) => {
  ['prev', 'next'].forEach((direction) => {
    $(`${kind}-${direction}`).addEventListener('click', () => {
      state[kind].offset = Math.max(
        0,
        state[kind].offset + (direction === 'next' ? pageSize : -pageSize),
      );
      if (kind === 'entries') loadEntries();
      else loadPlayers();
    });
  });
});
$('new-game').addEventListener('click', () => openGame());
document
  .querySelectorAll('[data-close]')
  .forEach((control) =>
    control.addEventListener('click', () => $(control.dataset.close).close()),
  );
['board-scale', 'board-decimals', 'board-unit'].forEach((id) =>
  $(id).addEventListener('input', previewFormat),
);

$('game-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = state.gameEditing || $('game-id').value.trim();
  const body = {
    name: $('game-name').value.trim(),
    enabled: $('game-enabled').checked,
  };
  showFormError('game-error');
  if (!body.name) {
    showFormError('game-error', '请输入游戏名称。');
    return;
  }
  if (!state.gameEditing && getGame(id)) {
    showFormError('game-error', '这个游戏 ID 已存在，请从游戏卡片进入编辑。');
    return;
  }
  const restore = beginForm(event.currentTarget);
  try {
    await api(`/games/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    $('game-dialog').close();
    if (!state.authenticated) return;
    notify(`已保存游戏“${body.name}”。`);
    await loadCatalog();
  } catch (error) {
    if (error.status !== 401) {
      if ($('game-dialog').open) showFormError('game-error', error.message);
      else notify(error.message, true);
    }
  } finally {
    restore();
  }
});

$('board-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const gameId = state.boardGameId;
  const id = state.boardEditing || $('board-id').value.trim();
  const body = {
    name: $('board-name').value.trim(),
    sortOrder: $('board-sort').value,
    scoreScale: Number($('board-scale').value),
    decimals: Number($('board-decimals').value),
    unit: $('board-unit').value.trim(),
    minScore: Number($('board-min').value),
    maxScore: Number($('board-max').value),
    enabled: $('board-enabled').checked,
    metadataFields: [
      ...new Set(
        $('board-metadata')
          .value.split(/[,，\n]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
  };
  showFormError('board-error');
  if (!body.name) {
    showFormError('board-error', '请输入榜单名称。');
    return;
  }
  if (!state.boardEditing && getBoard(gameId, id)) {
    showFormError('board-error', '这个榜单 ID 已存在，请从对应榜单进入编辑。');
    return;
  }
  if (body.minScore > body.maxScore) {
    showFormError('board-error', '最小存储值不能大于最大存储值。');
    return;
  }
  const restore = beginForm(event.currentTarget);
  try {
    await api(
      `/games/${encodeURIComponent(gameId)}/boards/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    $('board-dialog').close();
    if (!state.authenticated) return;
    notify(`已保存榜单“${body.name}”。`);
    await loadCatalog();
  } catch (error) {
    if (error.status !== 401) {
      const message =
        error.code === 'BOARD_RULES_LOCKED'
          ? '这张榜单已有提交历史，不能修改计分配置。仍可修改名称和开放状态；要使用新的计分规则，请创建另一张榜单。'
          : error.message;
      if ($('board-dialog').open) showFormError('board-error', message);
      else notify(message, true);
    }
  } finally {
    restore();
  }
});

async function initialize() {
  try {
    const data = await api('/session', { quietUnauthorized: true });
    if (data?.authenticated) await showApp();
    else showLogin();
  } catch (error) {
    showLogin(error.status === 401 ? '' : error.message);
  }
}

initialize();
