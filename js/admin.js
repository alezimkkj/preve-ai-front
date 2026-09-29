(function () {
  'use strict';
  var PA = window.PA, $ = PA.$, $all = PA.$all, esc = PA.esc, ic = PA.ic;

  var session = PA.getSession();
  if (!session) { window.location.replace('login.html'); return; }

  var alerts = PA.loadAlerts();
  var adminFilter = 'todos';

  var userEl = $('#admin-user');
  if (session.username) userEl.textContent = '— ' + session.username;

  var formDialog = PA.bindDialog($('#alert-dialog'));
  var confirmDialog = PA.bindDialog($('#confirm-dialog'));
  var form = $('#alert-form');
  var editing = null;
  var pendingDeleteId = null;

  function persist() { PA.saveAlerts(alerts); }

  /* ---------- Resumo e tabela ---------- */
  function render() {
    var f = adminFilter;
    var filtered = alerts.filter(function (a) {
      if (f === 'ativos') return a.status === 'ativo';
      if (f === 'encerrados') return a.status === 'encerrado';
      if (f === 'normal' || f === 'atencao' || f === 'critico') return a.level === f;
      return true;
    });
    var today = new Date().toDateString();
    var munCount = {}; alerts.forEach(function (a) { munCount[a.municipality] = 1; });
    var latest = alerts.slice().sort(function (a, b) { return new Date(b.issuedAt) - new Date(a.issuedAt); })[0];

    $('#sum-active').textContent = alerts.filter(function (a) { return a.status === 'ativo'; }).length;
    $('#sum-today').textContent = alerts.filter(function (a) { return new Date(a.issuedAt).toDateString() === today; }).length;
    $('#sum-mun').textContent = Object.keys(munCount).length;
    $('#sum-latest').textContent = latest ? PA.formatDateTime(latest.issuedAt) : '—';

    $all('[data-filter]').forEach(function (b) {
      var on = b.getAttribute('data-filter') === f;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });

    var table = $('#alerts-table');
    $all('.admin-table__row', table).forEach(function (r) { r.remove(); });
    table.insertAdjacentHTML('beforeend', filtered.map(function (a) {
      return '<div class="admin-table__row" role="row">' +
        '<span role="cell" data-label="Nível">' + PA.riskBadge(a.level, 'sm') + '</span>' +
        '<span role="cell" data-label="Município">' + ic('map-pinned', 14) + ' ' + esc(a.municipality) + '</span>' +
        '<span role="cell" data-label="Título" class="admin-table__title">' + esc(a.title) + '</span>' +
        '<span role="cell" data-label="Data">' + ic('calendar-clock', 14) + ' ' + PA.formatDateTime(a.issuedAt) + '</span>' +
        '<span role="cell" data-label="Status"><span class="status-pill status-pill--' + a.status + '">' + PA.statusLabels[a.status] + '</span></span>' +
        '<span role="cell" data-label="Ações" class="admin-table__actions">' +
        '<button type="button" class="icon-button" data-edit="' + esc(a.id) + '" aria-label="Editar alerta: ' + esc(a.title) + '">' + ic('pencil', 16) + '</button>' +
        '<button type="button" class="icon-button icon-button--danger" data-delete="' + esc(a.id) + '" aria-label="Excluir alerta: ' + esc(a.title) + '">' + ic('trash-2', 16) + '</button></span></div>';
    }).join(''));

    table.hidden = filtered.length === 0;
    $('#empty-filter').hidden = filtered.length !== 0;
    $('#empty-all').hidden = alerts.length !== 0;
  }

  function findAlert(id) { return alerts.filter(function (x) { return x.id === id; })[0]; }

  /* ---------- Formulário ---------- */
  function fillForm(i) {
    i = i || {};
    var set = function (id, v) { $('#' + id, form).value = v; };
    set('municipality', i.municipality || $('#municipality', form).options[0].value);
    set('level', i.level || 'normal');
    set('title', i.title || '');
    set('message', i.message || '');
    set('riverLevel', i.riverLevel != null ? i.riverLevel : '');
    set('rainfall', i.rainfall != null ? i.rainfall : '');
    set('issuedAt', PA.toLocalInput(i.issuedAt) || PA.toLocalInput(new Date().toISOString()));
    set('expiresAt', PA.toLocalInput(i.expiresAt));
    set('status', i.status || 'ativo');
    $all('[data-err]', form).forEach(function (el) { el.hidden = true; el.textContent = ''; });
  }

  function openForm(initial) {
    editing = initial || null;
    $('#alert-dialog-title').textContent = initial ? 'Editar alerta' : 'Criar novo alerta';
    $('#alert-submit').textContent = initial ? 'Salvar alterações' : 'Publicar alerta';
    fillForm(initial);
    formDialog.open();
  }

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
      issuedAt: PA.fromLocalInput(v('issuedAt')),
      expiresAt: v('expiresAt') ? PA.fromLocalInput(v('expiresAt')) : undefined,
      status: v('status')
    };
    if (editing) {
      data.id = editing.id;
      alerts = alerts.map(function (a) { return a.id === editing.id ? data : a; });
      PA.showToast('Alerta atualizado com sucesso.');
    } else {
      data.id = PA.genId();
      alerts = [data].concat(alerts);
      PA.showToast('Alerta publicado com sucesso.');
    }
    persist();
    formDialog.close();
    render();
  });

  /* ---------- Eventos ---------- */
  $('#create-alert').addEventListener('click', function () { openForm(); });

  $all('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () { adminFilter = b.getAttribute('data-filter'); render(); });
  });

  $('#alerts-table').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit]');
    var del = e.target.closest('[data-delete]');
    if (ed) {
      var a = findAlert(ed.getAttribute('data-edit'));
      if (a) openForm(a);
    } else if (del) {
      var d = findAlert(del.getAttribute('data-delete'));
      if (!d) return;
      pendingDeleteId = d.id;
      $('#confirm-text').textContent = 'Tem certeza de que deseja excluir o alerta "' + d.title + '"? Esta ação não pode ser desfeita.';
      confirmDialog.open();
    }
  });

  $('#confirm-cancel').addEventListener('click', confirmDialog.close);
  $('#confirm-ok').addEventListener('click', function () {
    var id = pendingDeleteId;
    confirmDialog.close();
    alerts = alerts.filter(function (x) { return x.id !== id; });
    persist();
    PA.showToast('Alerta excluído com sucesso.');
    render();
  });

  render();
})();
