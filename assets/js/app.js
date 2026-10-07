(function () {
  'use strict';

  /* ---------- Utilidades ---------- */
  var KEYS = { alerts: 'preveai_alerts_v2', theme: 'preveai_theme', municipality: 'preveai_selected_municipality', session: 'preveai_admin_session' };
  var levelLabels = { normal: 'Normal', atencao: 'Atenção', critico: 'Alerta crítico' };
  var statusLabels = { ativo: 'Ativo', encerrado: 'Encerrado' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function num(n) { return n == null ? '—' : Number(n).toLocaleString('pt-BR'); }
  function ic(name, size) { return window.icon(name, size); }

  function sGet(st, k) { try { return st.getItem(k); } catch (e) { return null; } }
  function sSet(st, k, v) { try { st.setItem(k, v); } catch (e) { /* no-op */ } }
  function sDel(st, k) { try { st.removeItem(k); } catch (e) { /* no-op */ } }

  function genId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'alert-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }
  function formatDateTime(iso) {
    try {
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch (e) { return iso; }
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : ''; }

  /* ---------- Sessão e alertas (armazenamento local) ---------- */
  function getSession() {
    var raw = sGet(sessionStorage, KEYS.session);
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function setSession(s) { sSet(sessionStorage, KEYS.session, JSON.stringify(s)); }
  function clearSession() { sDel(sessionStorage, KEYS.session); }

  function loadAlerts() {
    // Alertas automaticos (id "auto-...") vem sempre dos dados reais; os criados no painel ficam salvos.
    var stored = [];
    var raw = sGet(localStorage, KEYS.alerts);
    if (raw) {
      try { var p = JSON.parse(raw); if (Array.isArray(p)) stored = p; } catch (e) { /* ignora */ }
    }
    var manual = stored.filter(function (a) { return String(a.id).indexOf('auto-') !== 0; });
    var list = (window.seedAlerts || []).slice().concat(manual);
    sSet(localStorage, KEYS.alerts, JSON.stringify(list));
    return list;
  }
  function saveAlerts(list) { sSet(localStorage, KEYS.alerts, JSON.stringify(list)); }

  /* ---------- Tema ---------- */
  var theme = (function () {
    var t = sGet(localStorage, KEYS.theme);
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  })();

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    sSet(localStorage, KEYS.theme, theme);
    var btn = $('[data-action="toggle-theme"]');
    if (btn) {
      btn.innerHTML = ic(theme === 'dark' ? 'sun' : 'moon', 18);
      btn.setAttribute('aria-label', theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
    }
  }

  /* ---------- Cabeçalho: estado da sessão ---------- */
  function currentFile() {
    var f = location.pathname.split('/').pop();
    return f || 'index.html';
  }
  function updateAdminUi() {
    var logged = !!getSession();
    var quick = $('[data-admin-session]');
    var login = $('[data-admin-login]');
    if (quick) quick.hidden = !logged;
    if (login) login.hidden = logged;
    var nav = $('[data-admin-nav]');
    if (nav) {
      var href = logged ? 'admin.html' : 'login.html';
      nav.setAttribute('href', href);
      var label = $('span', nav);
      if (label) label.textContent = logged ? 'Painel' : 'Admin';
      nav.classList.toggle('is-active', href === currentFile());
    }
  }

  /* ---------- Toast ---------- */
  function showToast(message, kind) {
    kind = kind || 'success';
    var stack = $('#toast-stack');
    var el = document.createElement('div');
    el.className = 'toast toast--' + kind;
    el.innerHTML = ic(kind === 'success' ? 'circle-check' : 'triangle-alert', 18) + '<span>' + esc(message) + '</span>' +
      '<button type="button" aria-label="Fechar notificação" class="toast__close">' + ic('x', 14) + '</button>';
    $('.toast__close', el).addEventListener('click', function () { el.remove(); });
    stack.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }
  // Toast pendente entre páginas (ex.: login -> painel)
  function queueToast(message) { sSet(sessionStorage, 'preveai_toast', message); }
  function flushToast() {
    var m = sGet(sessionStorage, 'preveai_toast');
    if (m) { sDel(sessionStorage, 'preveai_toast'); showToast(m); }
  }

  /* ---------- Diálogos (marcação já existe no HTML da página) ---------- */
  function bindDialog(overlay) {
    var isOpen = false;
    function onKey(e) { if (e.key === 'Escape') close(); }
    function open() {
      if (isOpen) return;
      isOpen = true;
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      var body = $('.dialog-panel__body', overlay);
      var f = $('button, input, textarea, select', body) || $('[data-close]', overlay);
      if (f) f.focus();
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      overlay.hidden = true;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    $all('[data-close]', overlay).forEach(function (b) { b.addEventListener('click', close); });
    return { open: open, close: close, el: overlay };
  }

  /* ---------- Pequenos blocos de marcação reutilizados por listas dinâmicas ---------- */
  function riskBadge(level, size) {
    size = size || 'md';
    var iconName = { normal: 'circle-check', atencao: 'triangle-alert', critico: 'octagon-alert' }[level];
    return '<span class="risk-badge risk-badge--' + level + ' risk-badge--' + size + '" role="status">' +
      ic(iconName, size === 'lg' ? 20 : size === 'sm' ? 14 : 16) + '<span>' + levelLabels[level] + '</span></span>';
  }
  function alertCard(a) {
    return '<article class="alert-card alert-card--' + a.level + '"><div class="alert-card__top">' + riskBadge(a.level) +
      '<span class="status-pill status-pill--' + a.status + '">' + statusLabels[a.status] + '</span></div>' +
      '<h3 class="alert-card__title">' + esc(a.title) + '</h3>' +
      '<p class="alert-card__location">' + ic('map-pin', 14) + ' ' + esc(a.municipality) + '</p>' +
      '<p class="alert-card__message">' + esc(a.message) + '</p><div class="alert-card__meta">' +
      (typeof a.rainfall === 'number' ? '<span>' + ic('droplets', 14) + ' ' + num(a.rainfall) + ' mm</span>' : '') +
      (typeof a.riverLevel === 'number' ? '<span>' + ic('waves', 14) + ' ' + num(a.riverLevel) + ' m</span>' : '') +
      '<span>' + ic('clock', 14) + ' ' + formatDateTime(a.issuedAt) + '</span></div></article>';
  }

  window.PA = {
    KEYS: KEYS, levelLabels: levelLabels, statusLabels: statusLabels,
    esc: esc, $: $, $all: $all, num: num, ic: ic,
    sGet: sGet, sSet: sSet, sDel: sDel, genId: genId,
    formatDateTime: formatDateTime, toLocalInput: toLocalInput, fromLocalInput: fromLocalInput,
    getSession: getSession, setSession: setSession, clearSession: clearSession,
    loadAlerts: loadAlerts, saveAlerts: saveAlerts,
    showToast: showToast, queueToast: queueToast, bindDialog: bindDialog,
    riskBadge: riskBadge, alertCard: alertCard, updateAdminUi: updateAdminUi
  };

  /* ---------- Eventos globais ---------- */
  document.addEventListener('click', function (e) {
    var skip = e.target.closest('.skip-link');
    if (skip) {
      e.preventDefault();
      var mn = $('#conteudo-principal');
      if (mn) { mn.setAttribute('tabindex', '-1'); mn.focus(); mn.scrollIntoView(); }
      return;
    }
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var a = t.getAttribute('data-action');
    if (a === 'toggle-theme') {
      theme = theme === 'light' ? 'dark' : 'light';
      applyTheme();
    } else if (a === 'logout') {
      clearSession();
      window.location.href = 'index.html';
    }
  });

  applyTheme();
  updateAdminUi();
  flushToast();
})();
