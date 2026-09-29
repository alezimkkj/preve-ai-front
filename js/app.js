(function () {
  'use strict';

  /* ---------- Utilidades ---------- */
  var KEYS = { alerts: 'preveai_alerts', theme: 'preveai_theme', municipality: 'preveai_selected_municipality', session: 'preveai_admin_session' };
  var levelLabels = { normal: 'Normal', atencao: 'Atenção', critico: 'Alerta crítico' };
  var statusLabels = { ativo: 'Ativo', encerrado: 'Encerrado' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function num(n) { return Number(n).toLocaleString('pt-BR'); }
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
  function getMunicipality(id) { return municipalities.filter(function (m) { return m.id === id; })[0]; }

  /* ---------- Estado ---------- */
  var state = {
    theme: (function () {
      var t = sGet(localStorage, KEYS.theme);
      if (t === 'light' || t === 'dark') return t;
      return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    })(),
    session: (function () {
      var raw = sGet(sessionStorage, KEYS.session);
      try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    })(),
    alerts: (function () {
      var raw = sGet(localStorage, KEYS.alerts);
      if (raw) {
        try { var p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch (e) { /* fallthrough */ }
      }
      sSet(localStorage, KEYS.alerts, JSON.stringify(seedAlerts));
      return seedAlerts.slice();
    })(),
    selectedId: sGet(localStorage, KEYS.municipality) || 'tres-coroas',
    levelFilter: 'todos',
    municipalityFilter: 'todos',
    adminFilter: 'todos',
    searchQuery: ''
  };

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    sSet(localStorage, KEYS.theme, state.theme);
  }
  function persistAlerts() { sSet(localStorage, KEYS.alerts, JSON.stringify(state.alerts)); }

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

  /* ---------- Dialog ---------- */
  function openDialog(title, bodyHtml, maxWidth, onClose) {
    var overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = '<div class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" style="max-width:' + (maxWidth || 560) + 'px">' +
      '<div class="dialog-panel__header"><h2 id="dialog-title">' + esc(title) + '</h2>' +
      '<button type="button" class="icon-button" data-close aria-label="Fechar">' + ic('x', 18) + '</button></div>' +
      '<div class="dialog-panel__body">' + bodyHtml + '</div></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      document.body.style.overflow = '';
      if (onClose) onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    $('[data-close]', overlay).addEventListener('click', close);
    var f = $('button, input, textarea, select, [tabindex]:not([tabindex="-1"])', $('.dialog-panel__body', overlay)) || $('[data-close]', overlay);
    if (f) f.focus();
    return { el: overlay, close: close };
  }

  function confirmDialog(title, description, confirmLabel, onConfirm) {
    var dlg = openDialog(title,
      '<div class="confirm-dialog"><div class="confirm-dialog__icon" aria-hidden="true">' + ic('triangle-alert', 22) + '</div>' +
      '<p>' + esc(description) + '</p><div class="form-actions">' +
      '<button type="button" class="button button--ghost" data-cancel>Cancelar</button>' +
      '<button type="button" class="button button--danger" data-confirm>' + esc(confirmLabel || 'Excluir') + '</button></div></div>', 420);
    $('[data-cancel]', dlg.el).addEventListener('click', dlg.close);
    $('[data-confirm]', dlg.el).addEventListener('click', function () { dlg.close(); onConfirm(); });
  }

  /* ---------- Componentes ---------- */
  function riskBadge(level, size) {
    size = size || 'md';
    var iconName = { normal: 'circle-check', atencao: 'triangle-alert', critico: 'octagon-alert' }[level];
    return '<span class="risk-badge risk-badge--' + level + ' risk-badge--' + size + '" role="status">' +
      ic(iconName, size === 'lg' ? 20 : size === 'sm' ? 14 : 16) + '<span>' + levelLabels[level] + '</span></span>';
  }
  function demoBadge(label) {
    return '<span class="demo-badge">' + ic('flask-conical', 13) + esc(label || 'Dados demonstrativos') + '</span>';
  }
  function statCard(label, value, unit, iconName, tone) {
    return '<div class="stat-card' + (tone ? ' stat-card--' + tone : '') + '"><div class="stat-card__icon" aria-hidden="true">' + ic(iconName, 18) + '</div>' +
      '<div class="stat-card__body"><span class="stat-card__label">' + esc(label) + '</span><span class="stat-card__value">' + esc(value) +
      (unit ? '<span class="stat-card__unit"> ' + esc(unit) + '</span>' : '') + '</span></div></div>';
  }
  function sectionHeading(eyebrow, title, description) {
    return '<div class="section-heading">' + (eyebrow ? '<p class="section-heading__eyebrow">' + esc(eyebrow) + '</p>' : '') +
      '<h2>' + esc(title) + '</h2>' + (description ? '<p class="section-heading__desc">' + esc(description) + '</p>' : '') + '</div>';
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

  /* ---------- Layout ---------- */
  var navLinks = [
    { to: '/', label: 'Início' },
    { to: '/projeto', label: 'Projeto' },
    { to: '/monitoramento', label: 'Monitoramento' },
    { to: '/como-funciona', label: 'Como funciona' }
  ];
  function currentPath() {
    var h = location.hash.replace(/^#/, '');
    if (!h || h.charAt(0) !== '/') return '/';
    return h.split('?')[0] || '/';
  }
  function navigate(path) { location.hash = '#' + path; }

  function headerHtml(path) {
    var links = navLinks.map(function (l) {
      return '<a href="#' + l.to + '" class="site-nav__link' + (path === l.to ? ' is-active' : '') + '">' + l.label + '</a>';
    }).join('');
    var admin = state.session
      ? '<div class="admin-quick"><a href="#/admin" class="button button--ghost button--sm">' + ic('shield-check', 16) + ' Painel</a>' +
        '<button type="button" class="icon-button" data-action="logout" aria-label="Encerrar sessão de administrador">' + ic('log-out', 18) + '</button></div>'
      : '<a href="#/login" class="button button--primary button--sm">Área administrativa</a>';
    return '<header class="site-header"><div class="container site-header__inner">' +
      '<a href="#/" class="brand" aria-label="PrevêAÍ — página inicial"><span class="brand__mark" aria-hidden="true">' + ic('cloud-rain', 20) + '</span><span class="brand__name">PrevêAÍ</span></a>' +
      '<nav class="site-nav" aria-label="Navegação principal">' + links + '</nav>' +
      '<div class="site-header__actions"><button type="button" class="icon-button" data-action="toggle-theme" aria-label="' + (state.theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro') + '">' +
      ic(state.theme === 'dark' ? 'sun' : 'moon', 18) + '</button>' + admin + '</div></div></header>';
  }
  function footerHtml() {
    return '<footer class="site-footer"><div class="container site-footer__inner"><div class="site-footer__brand">' +
      '<span class="brand__mark" aria-hidden="true">' + ic('cloud-rain', 18) + '</span><div><strong>PrevêAÍ</strong><p>Protótipo de pesquisa acadêmica em monitoramento hidrometeorológico</p></div></div>' +
      '<div class="site-footer__cols"><div><h3>Projeto</h3><ul><li><a href="#/projeto">Sobre o projeto</a></li><li><a href="#/como-funciona">Como funciona</a></li><li><a href="#/monitoramento">Monitoramento</a></li></ul></div>' +
      '<div><h3>Região de estudo</h3><ul><li>Três Coroas/RS</li><li>Bacia do Rio Paranhana</li></ul></div>' +
      '<div><h3>Links</h3><ul><li><span class="footer-placeholder">Link do repositório (em breve)</span></li><li><span class="footer-placeholder">Publicação da pesquisa (em breve)</span></li></ul></div></div></div>' +
      '<div class="site-footer__bottom container"><p>© 2026 PrevêAÍ — projeto de pesquisa acadêmica sobre previsão de inundações. Todos os dados de monitoramento exibidos são demonstrativos.</p></div></footer>';
  }
  function bottomNavHtml(path) {
    var items = [
      { to: '/', label: 'Início', icon: 'home' },
      { to: '/projeto', label: 'Projeto', icon: 'file-text' },
      { to: '/monitoramento', label: 'Monitorar', icon: 'activity' },
      { to: '/como-funciona', label: 'Funciona', icon: 'help-circle' },
      { to: state.session ? '/admin' : '/login', label: state.session ? 'Painel' : 'Admin', icon: 'shield-check' }
    ];
    return '<nav class="bottom-nav" aria-label="Navegação principal (móvel)">' + items.map(function (i) {
      return '<a href="#' + i.to + '" class="bottom-nav__item' + (path === i.to ? ' is-active' : '') + '">' + ic(i.icon, 20) + '<span>' + i.label + '</span></a>';
    }).join('') + '</nav>';
  }

  var shellReady = false;
  function ensureShell() {
    if (shellReady) return;
    $('#root').innerHTML = '<div class="app-shell"><div id="hdr"></div><main id="conteudo-principal" class="app-main"></main><div id="ftr"></div><div id="bnav"></div></div>';
    $('#ftr').innerHTML = footerHtml();
    shellReady = true;
  }
  function renderChrome(path) {
    $('#hdr').innerHTML = headerHtml(path);
    $('#bnav').innerHTML = bottomNavHtml(path);
  }

  /* ---------- Gráficos SVG ---------- */
  function niceTicks(min, max, count) {
    var span = max - min || 1;
    var raw = span / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    var start = Math.floor(min / step) * step;
    var end = Math.ceil(max / step) * step;
    var ticks = [];
    for (var v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
    return ticks;
  }
  function fmtTick(v, unit) {
    return (Math.round(v * 100) / 100).toLocaleString('pt-BR') + unit;
  }
  function monotonePath(pts) {
    var n = pts.length;
    if (n < 2) return '';
    var dx = [], dy = [], m = [], t = [];
    for (var i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += ' C' + (pts[i][0] + h) + ',' + (pts[i][1] + h * t[i]) + ' ' + (pts[i + 1][0] - h) + ',' + (pts[i + 1][1] - h * t[i + 1]) + ' ' + pts[i + 1][0] + ',' + pts[i + 1][1];
    }
    return d;
  }

  // cfg: {data, key, type:'bar'|'area', unit, domainPad, tooltipLabel, valueFmt, gradId}
  function drawChart(container, cfg) {
    var W = Math.max(container.clientWidth, 240), H = 260;
    var M = { top: 8, right: 8, bottom: 26, left: cfg.left };
    var pw = W - M.left - M.right, ph = H - M.top - M.bottom;
    var vals = cfg.data.map(function (d) { return d[cfg.key]; });
    var lo = cfg.type === 'bar' ? 0 : Math.min.apply(null, vals) - 0.2;
    var hi = Math.max.apply(null, vals) + (cfg.type === 'bar' ? 0 : 0.2);
    var ticks = niceTicks(lo, hi, 5);
    var dMin = cfg.type === 'bar' ? 0 : ticks[0] < lo ? lo : ticks[0];
    var dMax = cfg.type === 'bar' ? ticks[ticks.length - 1] : hi;
    if (cfg.type === 'area') { ticks = ticks.filter(function (t) { return t >= dMin - 1e-9 && t <= dMax + 1e-9; }); }
    var yS = function (v) { return M.top + ph - ((v - dMin) / (dMax - dMin || 1)) * ph; };
    var n = cfg.data.length;
    var band = pw / n;
    var xS = function (i) { return cfg.type === 'bar' ? M.left + band * i + band / 2 : M.left + (pw * i) / (n - 1); };
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" style="display:block">';
    if (cfg.type === 'area') {
      s += '<defs><linearGradient id="' + cfg.gradId + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--color-brand-500)" stop-opacity="0.35"/><stop offset="100%" stop-color="var(--color-brand-500)" stop-opacity="0.02"/></linearGradient></defs>';
    }
    ticks.forEach(function (t) {
      var y = yS(t);
      s += '<line x1="' + M.left + '" x2="' + (W - M.right) + '" y1="' + y + '" y2="' + y + '" stroke="var(--color-line)" stroke-dasharray="3 3"/>';
      s += '<text x="' + (M.left - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="var(--color-slate)">' + fmtTick(t, cfg.unit) + '</text>';
    });
    s += '<line x1="' + M.left + '" x2="' + (W - M.right) + '" y1="' + (M.top + ph) + '" y2="' + (M.top + ph) + '" stroke="var(--color-line)"/>';
    cfg.data.forEach(function (d, i) {
      s += '<text x="' + xS(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="12" fill="var(--color-slate)">' + d.hour + '</text>';
    });
    if (cfg.type === 'bar') {
      var bw = Math.min(28, band * 0.7);
      cfg.data.forEach(function (d, i) {
        var x = xS(i) - bw / 2, y = yS(d.mm), h = M.top + ph - y, r = Math.min(6, bw / 2, h);
        if (h <= 0) return;
        s += '<path class="bar-item" data-i="' + i + '" fill="var(--color-brand-500)" d="M' + x + ',' + (y + h) + ' V' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y + ' H' + (x + bw - r) + ' Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + ' V' + (y + h) + ' Z"/>';
      });
    } else {
      var pts = cfg.data.map(function (d, i) { return [xS(i), yS(d.m)]; });
      var line = monotonePath(pts);
      s += '<path d="' + line + ' L' + pts[n - 1][0] + ',' + (M.top + ph) + ' L' + pts[0][0] + ',' + (M.top + ph) + ' Z" fill="url(#' + cfg.gradId + ')"/>';
      s += '<path d="' + line + '" fill="none" stroke="var(--color-brand-600)" stroke-width="2.5"/>';
    }
    s += '<line class="hover-line" x1="0" x2="0" y1="' + M.top + '" y2="' + (M.top + ph) + '" stroke="var(--color-line)" style="display:none"/>';
    s += '<rect class="hover-area" x="' + M.left + '" y="' + M.top + '" width="' + pw + '" height="' + ph + '" fill="transparent"/></svg>';

    var rows = cfg.data.map(function (d) { return '<tr><td>' + d.hour + '</td><td>' + d[cfg.key] + '</td></tr>'; }).join('');
    container.innerHTML = '<div class="chart-wrap" style="position:relative">' + s +
      '<div class="chart-tip" style="display:none;position:absolute;pointer-events:none;padding:8px 12px;border-radius:12px;border:1px solid var(--color-line);background:var(--color-surface);color:var(--color-ink);font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.12);white-space:nowrap;z-index:2"></div></div>' +
      '<table class="visually-hidden"><caption>' + cfg.caption + '</caption><thead><tr><th scope="col">Horário</th><th scope="col">' + cfg.colName + '</th></tr></thead><tbody>' + rows + '</tbody></table>';

    var wrap = $('.chart-wrap', container), tip = $('.chart-tip', container), hl = $('.hover-line', container), area = $('.hover-area', container);
    area.addEventListener('mousemove', function (e) {
      var r = wrap.getBoundingClientRect();
      var px = e.clientX - r.left;
      var idx = cfg.type === 'bar' ? Math.floor((px - M.left) / band) : Math.round(((px - M.left) / pw) * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));
      var d = cfg.data[idx];
      tip.innerHTML = '<div style="font-weight:600;margin-bottom:2px">Horário: ' + d.hour + '</div><div style="color:var(--color-ink-soft)">' + cfg.tooltipName + ': ' + d[cfg.key] + cfg.tooltipUnit + '</div>';
      tip.style.display = 'block';
      var left = xS(idx) + 12;
      if (left + tip.offsetWidth > W) left = xS(idx) - tip.offsetWidth - 12;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = '16px';
      if (cfg.type === 'area') { hl.setAttribute('x1', xS(idx)); hl.setAttribute('x2', xS(idx)); hl.style.display = ''; }
    });
    area.addEventListener('mouseleave', function () { tip.style.display = 'none'; hl.style.display = 'none'; });
  }

  function drawCharts() {
    var m = getMunicipality(state.selectedId) || municipalities[0];
    var r = $('#chart-rain'), v = $('#chart-river');
    if (r) {
      var rv = m.rainfallSeries.map(function (d) { return d.mm; });
      r.setAttribute('role', 'img');
      r.setAttribute('aria-label', 'Gráfico de precipitação nas últimas 24 horas, variando de ' + Math.min.apply(null, rv) + ' a ' + Math.max.apply(null, rv) + ' milímetros.');
      drawChart(r, { data: m.rainfallSeries, key: 'mm', type: 'bar', unit: ' mm', left: 60, caption: 'Precipitação por horário, em milímetros', colName: 'Precipitação (mm)', tooltipName: 'Precipitação', tooltipUnit: ' mm' });
    }
    if (v) {
      var vv = m.riverSeries.map(function (d) { return d.m; });
      v.setAttribute('role', 'img');
      v.setAttribute('aria-label', 'Gráfico do nível do Rio Paranhana ao longo do dia, variando de ' + Math.min.apply(null, vv).toFixed(2) + ' a ' + Math.max.apply(null, vv).toFixed(2) + ' metros.');
      drawChart(v, { data: m.riverSeries, key: 'm', type: 'area', unit: ' m', left: 56, gradId: 'riverGradient', caption: 'Nível do rio por horário, em metros', colName: 'Nível (m)', tooltipName: 'Nível do rio', tooltipUnit: ' m' });
    }
  }
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCharts, 120);
  });

  /* ---------- Mapa regional ---------- */
  var mapPos = { 'tres-coroas': { x: 220, y: 200 }, igrejinha: { x: 300, y: 150 }, taquara: { x: 130, y: 260 }, gramado: { x: 340, y: 70 }, canela: { x: 400, y: 100 } };
  var colorByLevel = { normal: 'var(--color-risk-normal)', atencao: 'var(--color-risk-atencao)', critico: 'var(--color-risk-critico)' };
  function regionalMap() {
    var river = 'M 60 280 C 140 260, 160 220, 220 200 C 260 185, 300 150, 340 70 C 360 40, 390 60, 400 100';
    var markers = municipalities.map(function (m) {
      var pos = mapPos[m.id] || { x: 240, y: 160 };
      var sel = m.id === state.selectedId;
      var lv = m.level === 'normal' ? 'normal' : m.level === 'atencao' ? 'atenção' : 'crítico';
      return '<g transform="translate(' + pos.x + ', ' + pos.y + ')" class="regional-map__marker-group" tabindex="0" role="button" data-map-id="' + m.id + '" aria-label="' + esc(m.name) + ', nível ' + lv + '">' +
        (sel ? '<circle r="16" fill="' + colorByLevel[m.level] + '" opacity="0.18"/>' : '') +
        '<circle r="' + (sel ? 10 : 8) + '" fill="' + colorByLevel[m.level] + '" stroke="var(--color-surface)" stroke-width="2.5"/>' +
        '<text y="-16" text-anchor="middle" class="regional-map__label">' + esc(m.name) + '</text></g>';
    }).join('');
    return '<div class="regional-map"><div class="regional-map__header"><h3>Visualização regional demonstrativa</h3>' + demoBadge('Representação simplificada') + '</div>' +
      '<p class="regional-map__caption">Diagrama ilustrativo da bacia do Rio Paranhana e municípios monitorados. As posições são aproximadas e não representam coordenadas geográficas precisas.</p>' +
      '<svg viewBox="0 0 480 320" role="img" aria-label="Mapa regional simplificado com marcadores dos municípios monitorados e seus níveis de alerta" class="regional-map__svg">' +
      '<path d="' + river + '" fill="none" stroke="var(--color-brand-400)" stroke-width="10" stroke-linecap="round" opacity="0.35"/>' +
      '<path d="' + river + '" fill="none" stroke="var(--color-brand-500)" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 10" opacity="0.7"/>' + markers + '</svg>' +
      '<ul class="regional-map__legend"><li><span class="legend-dot" style="background:var(--color-risk-normal)"></span> Normal</li>' +
      '<li><span class="legend-dot" style="background:var(--color-risk-atencao)"></span> Atenção</li>' +
      '<li><span class="legend-dot" style="background:var(--color-risk-critico)"></span> Alerta crítico</li></ul></div>';
  }

  /* ---------- Páginas ---------- */
  function pageHome() {
    var f = getMunicipality('tres-coroas');
    var pipeline = [
      ['Dados', 'Séries históricas e monitoramento de chuva e nível do rio', 'database'],
      ['Tratamento', 'Organização e limpeza das variáveis hidrometeorológicas', 'waves'],
      ['Análise / modelagem', 'Investigação de variáveis e horizontes de previsão (em desenvolvimento)', 'trending-up'],
      ['Previsão', 'Estimativas futuras a partir do modelo em pesquisa', 'cloud-rain'],
      ['Alerta', 'Classificação em níveis de risco compreensíveis', 'radio'],
      ['Comunicação', 'Envio acessível de informação, incluindo canais como WhatsApp', 'message-circle']
    ];
    return '<section class="hero"><div class="container hero__grid"><div class="hero__content">' + demoBadge('Protótipo de pesquisa acadêmica') +
      '<h1>Monitoramento e informação para antecipar riscos de inundação.</h1>' +
      '<p class="hero__lead">PrevêAÍ é um projeto de pesquisa dedicado ao estudo de variáveis hidrometeorológicas e horizontes de previsão aplicados à antecipação de inundações em Três Coroas/RS, na bacia do Rio Paranhana. Esta interface é o protótipo da camada de monitoramento e comunicação de alertas do futuro sistema.</p>' +
      '<div class="hero__actions"><a href="#/monitoramento" class="button button--primary button--lg">Consultar monitoramento ' + ic('arrow-right', 18) + '</a>' +
      '<a href="#/projeto" class="button button--ghost button--lg">Conhecer o projeto</a></div></div>' +
      '<div class="hero__visual" aria-hidden="true"><svg viewBox="0 0 360 320" class="hero__wave"><defs><linearGradient id="heroWave" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--color-brand-500)" stop-opacity="0.5"/><stop offset="100%" stop-color="var(--color-brand-500)" stop-opacity="0.05"/></linearGradient></defs>' +
      '<path d="M0 200 C 40 170, 80 230, 120 200 C 160 170, 200 230, 240 200 C 280 170, 320 230, 360 200 L 360 320 L 0 320 Z" fill="url(#heroWave)"/>' +
      '<path d="M0 200 C 40 170, 80 230, 120 200 C 160 170, 200 230, 240 200 C 280 170, 320 230, 360 200" fill="none" stroke="var(--color-brand-500)" stroke-width="3"/>' +
      '<path d="M0 240 C 40 215, 80 260, 120 240 C 160 215, 200 260, 240 240 C 280 215, 320 260, 360 240" fill="none" stroke="var(--color-brand-400)" stroke-width="2" opacity="0.6"/>' +
      '<g class="hero__pulse"><circle cx="220" cy="120" r="6" fill="var(--color-risk-atencao)"/><circle cx="220" cy="120" r="14" fill="var(--color-risk-atencao)" opacity="0.25"/></g>' +
      '<text x="70" y="60" class="hero__visual-label">Rio Paranhana</text></svg>' +
      '<div class="hero__visual-card">' + riskBadge(f.level, 'sm') + '<strong>' + f.name + '/RS</strong><span>' + num(f.riverLevel) + ' m no nível do rio</span></div></div></div></section>' +

      '<section class="section"><div class="container problem-grid"><div>' + sectionHeading('Contexto', 'Um município que convive com o risco de inundações') +
      '<p>Três Coroas, situada às margens do Rio Paranhana, é historicamente afetada por eventos de cheia e inundação. O tempo entre a chuva intensa e a elevação crítica do nível do rio pode ser curto, o que torna a antecipação e a comunicação de risco fatores importantes para a segurança da população.</p>' +
      '<p>O PrevêAÍ nasce como projeto de pesquisa para investigar como diferentes variáveis hidrometeorológicas e horizontes de previsão podem contribuir para modelos computacionais de apoio à decisão em situações de risco.</p></div>' +
      '<div class="problem-card"><h3>Por que isso importa</h3><ul><li>Antecipação: identificar sinais de risco antes da situação se agravar.</li><li>Clareza: comunicar informação técnica de forma compreensível para a população.</li><li>Acessibilidade: alcançar as pessoas por canais simples, como o WhatsApp.</li></ul></div></div></section>' +

      '<section class="section section--alt"><div class="container">' + sectionHeading('Da coleta ao alerta', 'Como os dados se transformam em informação útil', 'O sistema completo é pensado como um fluxo contínuo — da coleta de dados até a comunicação acessível de alertas.') +
      '<div class="pipeline">' + pipeline.map(function (s, i) {
        return '<div class="pipeline__step"><div class="pipeline__icon">' + ic(s[2], 18) + '</div><div><span class="pipeline__index">' + (i + 1) + '</span><h3>' + s[0] + '</h3><p>' + s[1] + '</p></div></div>';
      }).join('') + '</div><p class="pipeline__note"><strong>Estágio atual:</strong> a etapa de modelagem preditiva está em desenvolvimento na pesquisa. Esta interface demonstra as etapas de monitoramento, classificação de risco e comunicação de alertas.</p></div></section>' +

      '<section class="section"><div class="container">' + sectionHeading('Prévia', 'Painel de monitoramento', 'Um exemplo de como as condições hidrometeorológicas são apresentadas no protótipo, com dados demonstrativos.') +
      '<div class="monitoring-preview"><div class="monitoring-preview__header"><div>' + riskBadge(f.level) + '<h3>' + f.name + '/RS</h3></div>' + demoBadge() + '</div>' +
      '<div class="monitoring-preview__stats">' + statCard('Precipitação acumulada', num(f.rainfall24h), 'mm', 'cloud-rain') + statCard('Nível do rio', num(f.riverLevel), 'm', 'waves') +
      statCard('Variação do nível', (f.riverLevelChange > 0 ? '+' : '') + num(f.riverLevelChange), 'm', 'trending-up') + '</div>' +
      '<a href="#/monitoramento" class="button button--primary">Ver painel completo ' + ic('arrow-right', 16) + '</a></div></div></section>' +

      '<section class="section section--alt"><div class="container early-warning"><div class="early-warning__text">' +
      sectionHeading('Alerta antecipado', 'Transformar dado ambiental em informação compreensível', 'O objetivo do PrevêAÍ é traduzir variáveis técnicas em alertas claros — com ícone, cor e texto — para que qualquer pessoa entenda o nível de risco rapidamente, inclusive por canais acessíveis como o WhatsApp.') +
      '<a href="#/como-funciona" class="button button--ghost">Entender o funcionamento completo ' + ic('arrow-right', 16) + '</a></div>' +
      '<div class="early-warning__levels">' + riskBadge('normal', 'lg') + riskBadge('atencao', 'lg') + riskBadge('critico', 'lg') + '</div></div></section>';
  }

  function pageProjeto() {
    var variables = [
      ['Precipitação', 'Volume de chuva medido e acumulado ao longo do tempo, uma das principais variáveis de entrada.', 'cloud-rain'],
      ['Nível do rio', 'Altura da lâmina d\u2019água do Rio Paranhana, indicador direto de risco de transbordamento.', 'waves'],
      ['Temperatura', 'Contexto climático que pode influenciar padrões de evaporação e formação de chuva.', 'thermometer'],
      ['Umidade', 'Umidade relativa do ar, variável complementar na caracterização do cenário atmosférico.', 'droplets'],
      ['Dados antecedentes / históricos', 'Séries históricas usadas para identificar padrões e treinar modelos computacionais.', 'history'],
      ['Horizonte de previsão', 'Intervalo de tempo futuro para o qual o modelo busca antecipar condições de risco.', 'timer']
    ];
    var sources = [
      ['INMET', 'Instituto Nacional de Meteorologia — dados meteorológicos oficiais.'],
      ['ANA', 'Agência Nacional de Águas e Saneamento Básico — dados hidrológicos.'],
      ['SGB/CPRM', 'Serviço Geológico do Brasil — monitoramento geológico e hidrológico.'],
      ['CEMADEN', 'Centro Nacional de Monitoramento e Alertas de Desastres Naturais.']
    ];
    var roadmap = ['Coleta de dados', 'Tratamento', 'Modelagem', 'Avaliação', 'Alertas', 'Comunicação'];
    return '<div class="page-project"><section class="section page-hero"><div class="container">' + sectionHeading('Sobre a pesquisa', 'O projeto PrevêAÍ') +
      '<p class="page-lead">PrevêAÍ é um projeto de pesquisa acadêmica que investiga a influência de diferentes variáveis hidrometeorológicas e horizontes de previsão sobre modelos computacionais voltados à previsão de inundações. O estudo tem como recorte territorial o município de Três Coroas/RS, localizado na bacia do Rio Paranhana.</p></div></section>' +
      '<section class="section section--alt"><div class="container two-col"><div><h2>Problema</h2><p>Três Coroas está sujeita a eventos de cheia associados a chuvas intensas na bacia do Rio Paranhana. A rapidez com que o nível do rio pode subir exige mecanismos de acompanhamento contínuo e formas eficazes de comunicar o risco à população, especialmente em áreas historicamente mais expostas.</p></div>' +
      '<div><h2>Objetivo</h2><p>Investigar como diferentes combinações de variáveis hidrometeorológicas — como precipitação, nível do rio, temperatura e umidade — e diferentes horizontes de previsão influenciam o desempenho de modelos computacionais aplicados à previsão de inundações, com vistas a apoiar futuros sistemas de alerta antecipado.</p></div></div></section>' +
      '<section class="section"><div class="container">' + sectionHeading('Dados de entrada', 'Variáveis estudadas') + '<div class="variable-grid">' + variables.map(function (v) {
        return '<div class="variable-card"><div class="variable-card__icon" aria-hidden="true">' + ic(v[2], 20) + '</div><h3>' + v[0] + '</h3><p>' + v[1] + '</p></div>';
      }).join('') + '</div></div></section>' +
      '<section class="section section--alt"><div class="container two-col"><div><h2>Região de estudo</h2><p>A bacia do Rio Paranhana abrange municípios da encosta inferior do nordeste gaúcho, incluindo Três Coroas, Igrejinha, Taquara, além de áreas próximas a Gramado e Canela na porção superior da serra. Essa região concentra parte relevante da dinâmica hidrológica estudada pelo projeto.</p></div>' +
      '<div><h2>Fontes de dados</h2><p>A pesquisa considera fontes públicas oficiais como referência para dados hidrometeorológicos históricos e monitorados. Não há, neste protótipo de frontend, integração ativa com essas fontes — os valores exibidos são demonstrativos.</p></div></div></section>' +
      '<section class="section"><div class="container">' + sectionHeading('Referência', 'Fontes de dados consideradas na pesquisa') + '<div class="source-grid">' + sources.map(function (s) {
        return '<div class="source-card"><span class="source-card__icon" aria-hidden="true">' + ic('satellite', 16) + '</span><strong>' + s[0] + '</strong><p>' + s[1] + '</p></div>';
      }).join('') + '</div></div></section>' +
      '<section class="section section--alt"><div class="container">' + sectionHeading('Próximos passos', 'Futuro do projeto', 'O modelo preditivo do PrevêAÍ ainda está em desenvolvimento na pesquisa.') +
      '<ol class="roadmap">' + roadmap.map(function (s, i) { return '<li><span class="roadmap__index">' + (i + 1) + '</span><span>' + s + '</span></li>'; }).join('') + '</ol></div></section></div>';
  }

  function pageComoFunciona() {
    var steps = [
      ['Coleta de dados', 'Reunião de dados históricos e monitorados de precipitação, nível do rio e variáveis climáticas associadas.', 'database'],
      ['Organização e tratamento', 'Limpeza, padronização e organização das séries de dados hidrometeorológicos para análise.', 'wrench'],
      ['Análise / modelagem', 'Investigação de diferentes variáveis e horizontes de previsão em modelos computacionais — etapa em desenvolvimento na pesquisa.', 'line-chart'],
      ['Previsão', 'Geração de estimativas futuras sobre as condições hidrometeorológicas monitoradas.', 'cloud-rain'],
      ['Identificação de risco', 'Classificação das condições previstas em níveis de risco: normal, atenção ou crítico.', 'octagon-alert'],
      ['Geração de alerta', 'Criação de mensagens de alerta claras, com nível, ícone e texto explicativo.', 'radio'],
      ['Comunicação ao usuário', 'Distribuição da informação por canais acessíveis, como este painel e, futuramente, o WhatsApp.', 'message-circle']
    ];
    var tech = [
      ['HTML + CSS + JavaScript', 'Interface deste protótipo frontend'],
      ['Sem etapa de build', 'Site estático que pode ser aberto diretamente no navegador'],
      ['Python, Pandas, NumPy', 'Previstas para tratamento e análise de dados na pesquisa'],
      ['TensorFlow / Keras', 'Previstas para a modelagem preditiva da pesquisa'],
      ['SQLite', 'Prevista para armazenamento de dados na arquitetura futura'],
      ['WhatsApp / Evolution API', 'Prevista para comunicação de alertas à população']
    ];
    return '<div class="page-how"><section class="section page-hero"><div class="container">' + sectionHeading('Funcionamento', 'Como funciona o PrevêAÍ', 'Da coleta de dados até a comunicação de alertas — este é o fluxo completo estudado pela pesquisa.') + '</div></section>' +
      '<section class="section"><div class="container"><ol class="how-steps">' + steps.map(function (s, i) {
        return '<li class="how-steps__item"><div class="how-steps__marker"><span>' + (i + 1) + '</span></div><div class="how-steps__content"><div class="how-steps__icon" aria-hidden="true">' + ic(s[2], 18) + '</div><h3>' + s[0] + '</h3><p>' + s[1] + '</p></div></li>';
      }).join('') + '</ol><div class="callout-card"><p><strong>Escopo desta interface:</strong> este website implementa principalmente as etapas de <strong>interface, visualização de monitoramento e gerenciamento de alertas</strong>. O modelo preditivo em si é objeto de pesquisa em desenvolvimento e não está integrado a este frontend.</p></div></div></section>' +
      '<section class="section section--alt"><div class="container">' + sectionHeading('Tecnologia', 'Ecossistema tecnológico') +
      '<p class="page-lead" style="margin-bottom:24px">Há uma distinção importante entre as tecnologias previstas para o projeto de pesquisa como um todo e as tecnologias efetivamente utilizadas neste frontend.</p>' +
      '<div class="tech-grid">' + tech.map(function (t) { return '<div class="tech-card"><strong>' + t[0] + '</strong><p>' + t[1] + '</p></div>'; }).join('') + '</div></div></section></div>';
  }

  function pageNotFound() {
    return '<div class="not-found">' + ic('cloud-off', 40) + '<h1>Página não encontrada</h1><p>O endereço acessado não existe no PrevêAÍ. Volte para o início ou consulte o monitoramento.</p>' +
      '<div class="hero__actions"><a href="#/" class="button button--primary">Voltar ao início</a><a href="#/monitoramento" class="button button--ghost">Ir ao monitoramento</a></div></div>';
  }

  /* --- Login --- */
  function pageLogin() {
    return '<div class="login-page"><div class="login-card"><div class="login-card__logo"><span class="brand__mark" aria-hidden="true">' + ic('cloud-rain', 22) + '</span><div><strong>PrevêAÍ</strong><span>Área administrativa</span></div></div>' +
      '<div class="demo-notice">' + ic('info', 16) + '<span>Modo demonstração: a autenticação desta versão é simulada para fins acadêmicos.</span></div>' +
      '<form id="login-form" novalidate><div class="form-field"><label for="username">Usuário</label><input id="username" type="text" autocomplete="username" placeholder="admin" /><span class="field-error" id="err-username" hidden></span></div>' +
      '<div class="form-field"><label for="password">Senha</label><div class="password-field"><input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />' +
      '<button type="button" class="icon-button" id="toggle-pw" aria-label="Mostrar senha">' + ic('eye', 16) + '</button></div><span class="field-error" id="err-password" hidden></span></div>' +
      '<button type="submit" class="button button--primary button--block" id="login-btn">Entrar</button></form>' +
      '<p class="login-card__footnote">Qualquer usuário e senha não vazios são aceitos nesta versão de demonstração. Nenhuma autenticação real é realizada.</p></div></div>';
  }
  function bindLogin() {
    var form = $('#login-form');
    var pw = $('#password'), tg = $('#toggle-pw');
    tg.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      tg.innerHTML = ic(show ? 'eye-off' : 'eye', 16);
      tg.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('#username').value, p = pw.value, ok = true;
      var eu = $('#err-username'), ep = $('#err-password');
      eu.hidden = true; ep.hidden = true;
      if (!u.trim()) { eu.textContent = 'Informe um usuário.'; eu.hidden = false; ok = false; }
      if (!p.trim()) { ep.textContent = 'Informe uma senha.'; ep.hidden = false; ok = false; }
      if (!ok) return;
      var btn = $('#login-btn');
      btn.disabled = true; btn.textContent = 'Entrando…';
      setTimeout(function () {
        state.session = { username: u.trim(), loginAt: new Date().toISOString() };
        sSet(sessionStorage, KEYS.session, JSON.stringify(state.session));
        showToast('Sessão administrativa iniciada.');
        navigate('/admin');
      }, 500);
    });
  }

  /* --- Monitoramento --- */
  function searchListHtml(activeIndex) {
    var q = state.searchQuery.trim().toLowerCase();
    var results = municipalities.filter(function (m) { return m.name.toLowerCase().indexOf(q) !== -1; });
    var lv = { normal: 'Normal', atencao: 'Atenção', critico: 'Crítico' };
    return { results: results, html: (results.length === 0 ? '<li class="municipality-search__empty">Nenhum município encontrado.</li>' : '') +
      results.map(function (m, i) {
        return '<li role="option" aria-selected="' + (i === activeIndex) + '"><button type="button" class="municipality-search__option' + (i === activeIndex ? ' is-active' : '') + '" data-mid="' + m.id + '">' +
          '<span>' + esc(m.name) + '</span><span class="option-level option-level--' + m.level + '">' + lv[m.level] + '</span></button></li>';
      }).join('') };
  }

  function pageMonitoramento() {
    var sel = getMunicipality(state.selectedId) || municipalities[0];
    var descs = {
      normal: 'Os indicadores monitorados estão dentro da faixa considerada normal para a região.',
      atencao: 'Indicadores acima do padrão habitual. Recomenda-se acompanhar a evolução das condições.',
      critico: 'Indicadores em nível elevado, associados a maior risco de inundação. Recomenda-se atenção redobrada.'
    };
    var filtered = state.alerts.filter(function (a) {
      return (state.levelFilter === 'todos' || a.level === state.levelFilter) && (state.municipalityFilter === 'todos' || a.municipality === state.municipalityFilter);
    });
    return '<div class="page-monitoring"><section class="section page-hero"><div class="container">' +
      sectionHeading('Painel', 'Monitoramento hidrometeorológico', 'Consulte informações ambientais e condições de monitoramento por município.') +
      '<div class="municipality-search" id="msearch"><label for="municipality-search-input" class="visually-hidden">Pesquisar município</label>' +
      '<div class="municipality-search__field">' + ic('search', 18) + '<input id="municipality-search-input" type="text" role="combobox" aria-expanded="false" aria-controls="msearch-list" aria-autocomplete="list" autocomplete="off" placeholder="Pesquisar município…" value="' + esc(state.searchQuery) + '" /></div>' +
      '<ul id="msearch-list" role="listbox" class="municipality-search__list" hidden></ul></div></div></section>' +

      '<section class="section" style="padding-top:0"><div class="container"><div class="municipality-header"><div><h2>' + esc(sel.name) + '/' + sel.state + '</h2>' +
      '<p class="municipality-header__meta">Última atualização: ' + formatDateTime(sel.lastUpdate) + '</p></div>' + demoBadge() + '</div>' +
      '<div class="status-card"><span class="status-card__label">Situação atual</span>' + riskBadge(sel.level, 'lg') + '<p class="status-card__desc">' + descs[sel.level] + '</p></div>' +
      '<div class="stat-grid">' + statCard('Precipitação acumulada', num(sel.rainfall24h), 'mm', 'cloud-rain') + statCard('Nível do rio', num(sel.riverLevel), 'm', 'waves') +
      statCard('Variação do nível', (sel.riverLevelChange > 0 ? '+' : '') + num(sel.riverLevelChange), 'm', 'trending-up', sel.riverLevelChange > 0.15 ? 'atencao' : '') +
      statCard('Temperatura', num(sel.temperature), '°C', 'thermometer') + statCard('Umidade', String(sel.humidity), '%', 'droplets') + '</div>' +
      '<div class="chart-grid"><div class="chart-card"><div class="chart-card__header"><h3>Precipitação nas últimas 24 horas</h3>' + demoBadge() + '</div><div id="chart-rain"></div></div>' +
      '<div class="chart-card"><div class="chart-card__header"><h3>Nível do Rio Paranhana</h3>' + demoBadge() + '</div><div id="chart-river"></div></div></div>' +
      regionalMap() + '</div></section>' +

      '<section class="section section--alt"><div class="container">' + sectionHeading('Comunicação', 'Alertas recentes') +
      '<div class="alert-filters"><span class="alert-filters__label">' + ic('filter', 14) + ' Filtrar por:</span>' +
      '<div class="form-field form-field--inline"><label for="filter-municipio" class="visually-hidden">Município</label><select id="filter-municipio"><option value="todos">Todos os municípios</option>' +
      municipalities.map(function (m) { return '<option value="' + esc(m.name) + '"' + (state.municipalityFilter === m.name ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-field form-field--inline"><label for="filter-nivel" class="visually-hidden">Nível</label><select id="filter-nivel">' +
      [['todos', 'Todos os níveis'], ['normal', levelLabels.normal], ['atencao', levelLabels.atencao], ['critico', levelLabels.critico]].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.levelFilter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div></div>' +
      (filtered.length === 0 ? '<p class="empty-state">Nenhum alerta encontrado para os filtros selecionados.</p>' : '<div class="alert-grid">' + filtered.map(alertCard).join('') + '</div>') + '</div></section></div>';
  }

  function bindMonitoramento() {
    var input = $('#municipality-search-input'), list = $('#msearch-list');
    var active = -1, open = false, results = [];
    function refresh() {
      var r = searchListHtml(active);
      results = r.results;
      list.innerHTML = r.html;
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
    }
    function choose(id) {
      var m = getMunicipality(id);
      state.selectedId = id;
      sSet(localStorage, KEYS.municipality, id);
      state.searchQuery = m ? m.name : '';
      render();
    }
    input.addEventListener('input', function () { state.searchQuery = input.value; open = true; active = -1; refresh(); });
    input.addEventListener('focus', function () { open = true; refresh(); });
    input.addEventListener('blur', function () { setTimeout(function () { open = false; list.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 120); });
    input.addEventListener('keydown', function (e) {
      if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { open = true; refresh(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); refresh(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); refresh(); }
      else if (e.key === 'Enter') { if (active >= 0 && results[active]) { e.preventDefault(); choose(results[active].id); } }
      else if (e.key === 'Escape') { open = false; refresh(); }
    });
    list.addEventListener('mousedown', function (e) {
      var b = e.target.closest('[data-mid]');
      if (b) { e.preventDefault(); choose(b.getAttribute('data-mid')); }
    });
    $all('[data-map-id]').forEach(function (g) {
      g.addEventListener('click', function () { choose(g.getAttribute('data-map-id')); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(g.getAttribute('data-map-id')); }
      });
    });
    $('#filter-municipio').addEventListener('change', function (e) { state.municipalityFilter = e.target.value; render(); });
    $('#filter-nivel').addEventListener('change', function (e) { state.levelFilter = e.target.value; render(); });
    drawCharts();
  }

  /* --- Admin --- */
  var filterOptions = [['todos', 'Todos'], ['ativos', 'Ativos'], ['encerrados', 'Encerrados'], ['normal', 'Normal'], ['atencao', 'Atenção'], ['critico', 'Alerta crítico']];

  function pageAdmin() {
    var f = state.adminFilter;
    var filtered = state.alerts.filter(function (a) {
      if (f === 'ativos') return a.status === 'ativo';
      if (f === 'encerrados') return a.status === 'encerrado';
      if (f === 'normal' || f === 'atencao' || f === 'critico') return a.level === f;
      return true;
    });
    var today = new Date().toDateString();
    var activeCount = state.alerts.filter(function (a) { return a.status === 'ativo'; }).length;
    var todayCount = state.alerts.filter(function (a) { return new Date(a.issuedAt).toDateString() === today; }).length;
    var munCount = {}; state.alerts.forEach(function (a) { munCount[a.municipality] = 1; });
    var latest = state.alerts.slice().sort(function (a, b) { return new Date(b.issuedAt) - new Date(a.issuedAt); })[0];

    var rows = filtered.map(function (a) {
      return '<div class="admin-table__row" role="row">' +
        '<span role="cell" data-label="Nível">' + riskBadge(a.level, 'sm') + '</span>' +
        '<span role="cell" data-label="Município">' + ic('map-pinned', 14) + ' ' + esc(a.municipality) + '</span>' +
        '<span role="cell" data-label="Título" class="admin-table__title">' + esc(a.title) + '</span>' +
        '<span role="cell" data-label="Data">' + ic('calendar-clock', 14) + ' ' + formatDateTime(a.issuedAt) + '</span>' +
        '<span role="cell" data-label="Status"><span class="status-pill status-pill--' + a.status + '">' + statusLabels[a.status] + '</span></span>' +
        '<span role="cell" data-label="Ações" class="admin-table__actions">' +
        '<button type="button" class="icon-button" data-edit="' + esc(a.id) + '" aria-label="Editar alerta: ' + esc(a.title) + '">' + ic('pencil', 16) + '</button>' +
        '<button type="button" class="icon-button icon-button--danger" data-delete="' + esc(a.id) + '" aria-label="Excluir alerta: ' + esc(a.title) + '">' + ic('trash-2', 16) + '</button></span></div>';
    }).join('');

    return '<div class="page-admin"><section class="section page-hero page-hero--admin"><div class="container admin-header"><div>' +
      sectionHeading('Gerenciamento de alertas do PrevêAÍ', 'Painel administrativo') +
      '<span class="admin-badge">' + ic('shield-check', 14) + ' Administrador ' + (state.session && state.session.username ? '— ' + esc(state.session.username) : '') + ' — modo demonstração</span></div>' +
      '<button type="button" class="button button--primary" data-action="create-alert">' + ic('plus', 18) + ' Criar novo alerta</button></div></section>' +
      '<section class="section" style="padding-top:0"><div class="container"><div class="summary-grid">' +
      '<div class="summary-card"><span class="summary-card__label">Alertas ativos</span><span class="summary-card__value">' + activeCount + '</span></div>' +
      '<div class="summary-card"><span class="summary-card__label">Alertas criados hoje</span><span class="summary-card__value">' + todayCount + '</span></div>' +
      '<div class="summary-card"><span class="summary-card__label">Municípios com alertas</span><span class="summary-card__value">' + Object.keys(munCount).length + '</span></div>' +
      '<div class="summary-card"><span class="summary-card__label">Último alerta</span><span class="summary-card__value summary-card__value--sm">' + (latest ? formatDateTime(latest.issuedAt) : '—') + '</span></div></div>' +
      '<div class="admin-filters" role="group" aria-label="Filtrar alertas">' + filterOptions.map(function (o) {
        return '<button type="button" class="chip' + (f === o[0] ? ' is-active' : '') + '" data-filter="' + o[0] + '" aria-pressed="' + (f === o[0]) + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      (filtered.length === 0 ? '<p class="empty-state">Nenhum alerta encontrado para este filtro.</p>' :
        '<div class="admin-table" role="table" aria-label="Lista de alertas"><div class="admin-table__head" role="row"><span role="columnheader">Nível</span><span role="columnheader">Município</span><span role="columnheader">Título</span><span role="columnheader">Data</span><span role="columnheader">Status</span><span role="columnheader">Ações</span></div>' + rows + '</div>') +
      (state.alerts.length === 0 ? '<div class="empty-state empty-state--full">' + ic('bell', 22) + '<p>Nenhum alerta cadastrado ainda. Crie o primeiro alerta para começar.</p></div>' : '') +
      '</div></section></div>';
  }

  function alertFormHtml(initial) {
    var opt = function (v, l, cur) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>'; };
    var i = initial || {};
    return '<form class="alert-form" id="alert-form" novalidate><div class="form-grid"><div class="form-field"><label for="municipality">Município</label><select id="municipality">' +
      municipalities.map(function (m) { return opt(esc(m.name), esc(m.name), i.municipality || municipalities[0].name); }).join('') + '</select><span class="field-error" data-err="municipality" hidden></span></div>' +
      '<div class="form-field"><label for="level">Nível do alerta</label><select id="level">' + opt('normal', 'Normal', i.level || 'normal') + opt('atencao', 'Atenção', i.level) + opt('critico', 'Alerta crítico', i.level) + '</select></div></div>' +
      '<div class="form-field"><label for="title">Título</label><input id="title" type="text" value="' + esc(i.title || '') + '" placeholder="Ex.: Elevação do nível do Rio Paranhana" /><span class="field-error" data-err="title" hidden></span></div>' +
      '<div class="form-field"><label for="message">Mensagem</label><textarea id="message" rows="4" placeholder="Descreva a situação monitorada e as recomendações relevantes.">' + esc(i.message || '') + '</textarea><span class="field-error" data-err="message" hidden></span></div>' +
      '<div class="form-grid"><div class="form-field"><label for="riverLevel">Nível do rio (m) — opcional</label><input id="riverLevel" type="number" step="0.01" min="0" value="' + (i.riverLevel != null ? i.riverLevel : '') + '" /></div>' +
      '<div class="form-field"><label for="rainfall">Precipitação acumulada (mm) — opcional</label><input id="rainfall" type="number" step="0.1" min="0" value="' + (i.rainfall != null ? i.rainfall : '') + '" /></div></div>' +
      '<div class="form-grid"><div class="form-field"><label for="issuedAt">Data/hora de emissão</label><input id="issuedAt" type="datetime-local" value="' + (toLocalInput(i.issuedAt) || toLocalInput(new Date().toISOString())) + '" /><span class="field-error" data-err="issuedAt" hidden></span></div>' +
      '<div class="form-field"><label for="expiresAt">Data/hora de validade — opcional</label><input id="expiresAt" type="datetime-local" value="' + toLocalInput(i.expiresAt) + '" /></div></div>' +
      '<div class="form-field"><label for="status">Status</label><select id="status">' + opt('ativo', 'Ativo', i.status || 'ativo') + opt('encerrado', 'Encerrado', i.status) + '</select></div>' +
      '<div class="form-actions"><button type="button" class="button button--ghost" data-cancel>Cancelar</button><button type="submit" class="button button--primary">' + (initial ? 'Salvar alterações' : 'Publicar alerta') + '</button></div></form>';
  }

  function openAlertForm(initial) {
    var dlg = openDialog(initial ? 'Editar alerta' : 'Criar novo alerta', alertFormHtml(initial), 620);
    var form = $('#alert-form', dlg.el);
    $('[data-cancel]', dlg.el).addEventListener('click', dlg.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (id) { return $('#' + id, form).value; };
      var errs = {};
      if (!v('municipality')) errs.municipality = 'Selecione um município.';
      if (!v('title').trim()) errs.title = 'Informe um título para o alerta.';
      if (!v('message').trim()) errs.message = 'Informe uma mensagem para o alerta.';
      if (!v('issuedAt')) errs.issuedAt = 'Informe a data e hora de emissão.';
      $all('[data-err]', form).forEach(function (el) {
        var m = errs[el.getAttribute('data-err')];
        el.hidden = !m; el.textContent = m || '';
      });
      if (Object.keys(errs).length) return;
      var data = {
        municipality: v('municipality'), level: v('level'), title: v('title').trim(), message: v('message').trim(),
        riverLevel: v('riverLevel') ? Number(v('riverLevel')) : undefined,
        rainfall: v('rainfall') ? Number(v('rainfall')) : undefined,
        issuedAt: fromLocalInput(v('issuedAt')),
        expiresAt: v('expiresAt') ? fromLocalInput(v('expiresAt')) : undefined,
        status: v('status')
      };
      if (initial) {
        data.id = initial.id;
        state.alerts = state.alerts.map(function (a) { return a.id === initial.id ? data : a; });
        showToast('Alerta atualizado com sucesso.');
      } else {
        data.id = genId();
        state.alerts = [data].concat(state.alerts);
        showToast('Alerta publicado com sucesso.');
      }
      persistAlerts();
      dlg.close();
      render();
    });
  }

  function bindAdmin() {
    $all('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () { state.adminFilter = b.getAttribute('data-filter'); render(); });
    });
    $all('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-edit');
        var a = state.alerts.filter(function (x) { return x.id === id; })[0];
        if (a) openAlertForm(a);
      });
    });
    $all('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-delete');
        var a = state.alerts.filter(function (x) { return x.id === id; })[0];
        if (!a) return;
        confirmDialog('Excluir alerta', 'Tem certeza de que deseja excluir o alerta "' + a.title + '"? Esta ação não pode ser desfeita.', 'Excluir', function () {
          state.alerts = state.alerts.filter(function (x) { return x.id !== id; });
          persistAlerts();
          showToast('Alerta excluído com sucesso.');
          render();
        });
      });
    });
    var c = $('[data-action="create-alert"]');
    if (c) c.addEventListener('click', function () { openAlertForm(); });
  }

  /* ---------- Roteador ---------- */
  function render() {
    var path = currentPath();
    if (path === '/admin' && !state.session) { navigate('/login'); return; }
    ensureShell();
    renderChrome(path);
    var main = $('#conteudo-principal');
    var scrollY = window.scrollY;
    var html, bind;
    switch (path) {
      case '/': html = pageHome(); break;
      case '/projeto': html = pageProjeto(); break;
      case '/monitoramento': html = pageMonitoramento(); bind = bindMonitoramento; break;
      case '/como-funciona': html = pageComoFunciona(); break;
      case '/login': html = pageLogin(); bind = bindLogin; break;
      case '/admin': html = pageAdmin(); bind = bindAdmin; break;
      default: html = pageNotFound();
    }
    main.innerHTML = html;
    if (bind) bind();
    if (render.lastPath === path) window.scrollTo(0, scrollY);
    render.lastPath = path;
  }

  window.addEventListener('hashchange', function () {
    if (currentPath() !== render.lastPath) window.scrollTo(0, 0);
    render();
  });

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
    if (a === 'toggle-theme') { state.theme = state.theme === 'light' ? 'dark' : 'light'; applyTheme(); renderChrome(currentPath()); }
    else if (a === 'logout') {
      sDel(sessionStorage, KEYS.session);
      state.session = null;
      if (currentPath() === '/') render(); else navigate('/');
      renderChrome(currentPath());
    }
  });

  applyTheme();
  render();
})();
