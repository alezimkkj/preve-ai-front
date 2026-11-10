(function () {
  'use strict';

  var KEYS = {
    alerts: 'preveai_alerts_v2',
    theme: 'preveai_theme',
    municipality: 'preveai_selected_municipality',
    session: 'preveai_admin_session',
    toast: 'preveai_toast'
  };

  var LEVEL_LABELS = {
    normal: 'Normal',
    atencao: 'Atenção',
    critico: 'Alerta crítico'
  };

  var STATUS_LABELS = {
    ativo: 'Ativo',
    encerrado: 'Encerrado'
  };

  var RISK_ICONS = {
    normal: 'circle-check',
    atencao: 'triangle-alert',
    critico: 'octagon-alert'
  };

  var RISK_ICON_SIZES = {
    sm: 14,
    md: 16,
    lg: 20
  };

  var HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  var AUTO_ALERT_PREFIX = 'auto-';
  var TOAST_DURATION_MS = 3600;

  var theme = getInitialTheme();

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return HTML_ESCAPES[char];
    });
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function num(value) {
    return value == null ? '—' : Number(value).toLocaleString('pt-BR');
  }

  function ic(name, size) {
    return window.icon(name, size);
  }

  function sGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function sSet(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch (e) {}
  }

  function sDel(storage, key) {
    try {
      storage.removeItem(key);
    } catch (e) {}
  }

  function genId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'alert-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function formatDateTime(iso) {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch (e) {
      return iso;
    }
  }

  function toLocalInput(iso) {
    if (!iso) return '';

    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';

    function pad(n) {
      return String(n).padStart(2, '0');
    }

    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function fromLocalInput(value) {
    return value ? new Date(value).toISOString() : '';
  }

  function getSession() {
    var raw = sGet(sessionStorage, KEYS.session);

    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    sSet(sessionStorage, KEYS.session, JSON.stringify(session));
  }

  function clearSession() {
    sDel(sessionStorage, KEYS.session);
  }

  function readStoredAlerts() {
    var raw = sGet(localStorage, KEYS.alerts);
    if (!raw) return [];

    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function loadAlerts() {
    var manualAlerts = readStoredAlerts().filter(function (alert) {
      return String(alert.id).indexOf(AUTO_ALERT_PREFIX) !== 0;
    });
    var list = (window.seedAlerts || []).slice().concat(manualAlerts);

    sSet(localStorage, KEYS.alerts, JSON.stringify(list));
    return list;
  }

  function saveAlerts(list) {
    sSet(localStorage, KEYS.alerts, JSON.stringify(list));
  }

  function getInitialTheme() {
    var stored = sGet(localStorage, KEYS.theme);
    if (stored === 'light' || stored === 'dark') return stored;

    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    var isDark = theme === 'dark';
    var button = $('[data-action="toggle-theme"]');

    document.documentElement.setAttribute('data-theme', theme);
    sSet(localStorage, KEYS.theme, theme);

    if (!button) return;

    button.innerHTML = ic(isDark ? 'sun' : 'moon', 18);
    button.setAttribute('aria-label', isDark ? 'Ativar tema claro' : 'Ativar tema escuro');
  }

  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    applyTheme();
  }

  function currentFile() {
    return location.pathname.split('/').pop() || 'index.html';
  }

  function updateAdminUi() {
    var logged = !!getSession();
    var quickActions = $('[data-admin-session]');
    var loginButton = $('[data-admin-login]');
    var navItem = $('[data-admin-nav]');

    if (quickActions) quickActions.hidden = !logged;
    if (loginButton) loginButton.hidden = logged;

    if (!navItem) return;

    var href = logged ? 'admin.html' : 'login.html';
    var label = $('span', navItem);

    navItem.setAttribute('href', href);
    if (label) label.textContent = logged ? 'Painel' : 'Admin';
    navItem.classList.toggle('is-active', href === currentFile());
  }

  function showToast(message, kind) {
    kind = kind || 'success';

    var stack = $('#toast-stack');
    var toast = document.createElement('div');

    toast.className = 'toast toast--' + kind;
    toast.innerHTML =
      ic(kind === 'success' ? 'circle-check' : 'triangle-alert', 18) +
      '<span>' + esc(message) + '</span>' +
      '<button type="button" aria-label="Fechar notificação" class="toast__close">' + ic('x', 14) + '</button>';

    $('.toast__close', toast).addEventListener('click', function () {
      toast.remove();
    });

    stack.appendChild(toast);

    setTimeout(function () {
      toast.remove();
    }, TOAST_DURATION_MS);
  }

  function queueToast(message) {
    sSet(sessionStorage, KEYS.toast, message);
  }

  function flushToast() {
    var message = sGet(sessionStorage, KEYS.toast);
    if (!message) return;

    sDel(sessionStorage, KEYS.toast);
    showToast(message);
  }

  function bindDialog(overlay) {
    var isOpen = false;

    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }

    function open() {
      if (isOpen) return;

      isOpen = true;
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKeyDown);

      var body = $('.dialog-panel__body', overlay);
      var focusTarget = $('button, input, textarea, select', body) || $('[data-close]', overlay);
      if (focusTarget) focusTarget.focus();
    }

    function close() {
      if (!isOpen) return;

      isOpen = false;
      overlay.hidden = true;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    }

    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) close();
    });

    $all('[data-close]', overlay).forEach(function (button) {
      button.addEventListener('click', close);
    });

    return { open: open, close: close, el: overlay };
  }

  function riskBadge(level, size) {
    size = size || 'md';

    return '<span class="risk-badge risk-badge--' + level + ' risk-badge--' + size + '" role="status">' +
      ic(RISK_ICONS[level], RISK_ICON_SIZES[size] || RISK_ICON_SIZES.md) +
      '<span>' + LEVEL_LABELS[level] + '</span></span>';
  }

  function alertMetaHtml(alert) {
    var html = '';

    if (typeof alert.rainfall === 'number') {
      html += '<span>' + ic('droplets', 14) + ' ' + num(alert.rainfall) + ' mm</span>';
    }

    if (typeof alert.riverLevel === 'number') {
      html += '<span>' + ic('waves', 14) + ' ' + num(alert.riverLevel) + ' m</span>';
    }

    html += '<span>' + ic('clock', 14) + ' ' + formatDateTime(alert.issuedAt) + '</span>';

    return html;
  }

  function alertCard(alert) {
    return '<article class="alert-card alert-card--' + alert.level + '">' +
      '<div class="alert-card__top">' + riskBadge(alert.level) +
      '<span class="status-pill status-pill--' + alert.status + '">' + STATUS_LABELS[alert.status] + '</span></div>' +
      '<h3 class="alert-card__title">' + esc(alert.title) + '</h3>' +
      '<p class="alert-card__location">' + ic('map-pin', 14) + ' ' + esc(alert.municipality) + '</p>' +
      '<p class="alert-card__message">' + esc(alert.message) + '</p>' +
      '<div class="alert-card__meta">' + alertMetaHtml(alert) + '</div></article>';
  }

  function handleSkipLink(e) {
    e.preventDefault();

    var main = $('#conteudo-principal');
    if (!main) return;

    main.setAttribute('tabindex', '-1');
    main.focus();
    main.scrollIntoView();
  }

  function handleAction(action) {
    if (action === 'toggle-theme') {
      toggleTheme();
    } else if (action === 'logout') {
      clearSession();
      window.location.href = 'index.html';
    }
  }

  function handleDocumentClick(e) {
    if (e.target.closest('.skip-link')) {
      handleSkipLink(e);
      return;
    }

    var target = e.target.closest('[data-action]');
    if (!target) return;

    handleAction(target.getAttribute('data-action'));
  }

  window.PA = {
    KEYS: KEYS,
    levelLabels: LEVEL_LABELS,
    statusLabels: STATUS_LABELS,
    esc: esc,
    $: $,
    $all: $all,
    num: num,
    ic: ic,
    sGet: sGet,
    sSet: sSet,
    sDel: sDel,
    genId: genId,
    formatDateTime: formatDateTime,
    toLocalInput: toLocalInput,
    fromLocalInput: fromLocalInput,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    loadAlerts: loadAlerts,
    saveAlerts: saveAlerts,
    showToast: showToast,
    queueToast: queueToast,
    bindDialog: bindDialog,
    riskBadge: riskBadge,
    alertCard: alertCard,
    updateAdminUi: updateAdminUi
  };

  document.addEventListener('click', handleDocumentClick);

  applyTheme();
  updateAdminUi();
  flushToast();
})();