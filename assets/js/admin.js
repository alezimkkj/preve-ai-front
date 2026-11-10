(function () {
  'use strict';

  var PA = window.PA;
  var $ = PA.$;
  var $all = PA.$all;
  var esc = PA.esc;
  var ic = PA.ic;

  var session = PA.getSession();

  if (!session) {
    window.location.replace('login.html');
    return;
  }

  var alerts = PA.loadAlerts();
  var adminFilter = 'todos';
  var editing = null;
  var pendingDeleteId = null;

  var form = $('#alert-form');
  var table = $('#alerts-table');
  var formDialog = PA.bindDialog($('#alert-dialog'));
  var confirmDialog = PA.bindDialog($('#confirm-dialog'));

  var LEVEL_FILTERS = ['normal', 'atencao', 'critico'];

  function persist() {
    PA.saveAlerts(alerts);
  }

  function findAlert(id) {
    return alerts.filter(function (alert) {
      return alert.id === id;
    })[0];
  }

  function matchesFilter(alert, filter) {
    if (filter === 'ativos') return alert.status === 'ativo';
    if (filter === 'encerrados') return alert.status === 'encerrado';
    if (LEVEL_FILTERS.indexOf(filter) !== -1) return alert.level === filter;
    return true;
  }

  function getFilteredAlerts() {
    return alerts.filter(function (alert) {
      return matchesFilter(alert, adminFilter);
    });
  }

  function renderSummary() {
    var today = new Date().toDateString();
    var municipalities = {};

    alerts.forEach(function (alert) {
      municipalities[alert.municipality] = true;
    });

    var latest = alerts.slice().sort(function (a, b) {
      return new Date(b.issuedAt) - new Date(a.issuedAt);
    })[0];

    $('#sum-active').textContent = alerts.filter(function (alert) {
      return alert.status === 'ativo';
    }).length;

    $('#sum-today').textContent = alerts.filter(function (alert) {
      return new Date(alert.issuedAt).toDateString() === today;
    }).length;

    $('#sum-mun').textContent = Object.keys(municipalities).length;
    $('#sum-latest').textContent = latest ? PA.formatDateTime(latest.issuedAt) : '—';
  }

  function renderFilterButtons() {
    $all('[data-filter]').forEach(function (button) {
      var isActive = button.getAttribute('data-filter') === adminFilter;

      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function buildRow(alert) {
    var id = esc(alert.id);
    var title = esc(alert.title);

    return '<div class="admin-table__row" role="row">' +
      '<span role="cell" data-label="Nível">' + PA.riskBadge(alert.level, 'sm') + '</span>' +
      '<span role="cell" data-label="Município">' + ic('map-pinned', 14) + ' ' + esc(alert.municipality) + '</span>' +
      '<span role="cell" data-label="Título" class="admin-table__title">' + title + '</span>' +
      '<span role="cell" data-label="Data">' + ic('calendar-clock', 14) + ' ' + PA.formatDateTime(alert.issuedAt) + '</span>' +
      '<span role="cell" data-label="Status">' +
      '<span class="status-pill status-pill--' + alert.status + '">' + PA.statusLabels[alert.status] + '</span></span>' +
      '<span role="cell" data-label="Ações" class="admin-table__actions">' +
      '<button type="button" class="icon-button" data-edit="' + id + '" aria-label="Editar alerta: ' + title + '">' +
      ic('pencil', 16) + '</button>' +
      '<button type="button" class="icon-button icon-button--danger" data-delete="' + id +
      '" aria-label="Excluir alerta: ' + title + '">' + ic('trash-2', 16) + '</button></span></div>';
  }

  function renderTable(filtered) {
    $all('.admin-table__row', table).forEach(function (row) {
      row.remove();
    });

    table.insertAdjacentHTML('beforeend', filtered.map(buildRow).join(''));
    table.hidden = filtered.length === 0;
    $('#empty-filter').hidden = filtered.length !== 0;
    $('#empty-all').hidden = alerts.length !== 0;
  }

  function render() {
    renderSummary();
    renderFilterButtons();
    renderTable(getFilteredAlerts());
  }

  function setFieldValue(id, value) {
    $('#' + id, form).value = value;
  }

  function getFieldValue(id) {
    return $('#' + id, form).value;
  }

  function clearFormErrors() {
    $all('[data-err]', form).forEach(function (element) {
      element.hidden = true;
      element.textContent = '';
    });
  }

  function fillForm(initial) {
    var item = initial || {};

    setFieldValue('municipality', item.municipality || $('#municipality', form).options[0].value);
    setFieldValue('level', item.level || 'normal');
    setFieldValue('title', item.title || '');
    setFieldValue('message', item.message || '');
    setFieldValue('riverLevel', item.riverLevel != null ? item.riverLevel : '');
    setFieldValue('rainfall', item.rainfall != null ? item.rainfall : '');
    setFieldValue('issuedAt', PA.toLocalInput(item.issuedAt) || PA.toLocalInput(new Date().toISOString()));
    setFieldValue('expiresAt', PA.toLocalInput(item.expiresAt));
    setFieldValue('status', item.status || 'ativo');
    clearFormErrors();
  }

  function openForm(initial) {
    editing = initial || null;

    $('#alert-dialog-title').textContent = initial ? 'Editar alerta' : 'Criar novo alerta';
    $('#alert-submit').textContent = initial ? 'Salvar alterações' : 'Publicar alerta';

    fillForm(initial);
    formDialog.open();
  }

  function validateForm() {
    var errors = {};

    if (!getFieldValue('municipality')) errors.municipality = 'Selecione um município.';
    if (!getFieldValue('title').trim()) errors.title = 'Informe um título para o alerta.';
    if (!getFieldValue('message').trim()) errors.message = 'Informe uma mensagem para o alerta.';
    if (!getFieldValue('issuedAt')) errors.issuedAt = 'Informe a data e hora de emissão.';

    $all('[data-err]', form).forEach(function (element) {
      var message = errors[element.getAttribute('data-err')];

      element.hidden = !message;
      element.textContent = message || '';
    });

    return Object.keys(errors).length === 0;
  }

  function readFormData() {
    var riverLevel = getFieldValue('riverLevel');
    var rainfall = getFieldValue('rainfall');
    var expiresAt = getFieldValue('expiresAt');

    return {
      municipality: getFieldValue('municipality'),
      level: getFieldValue('level'),
      title: getFieldValue('title').trim(),
      message: getFieldValue('message').trim(),
      riverLevel: riverLevel ? Number(riverLevel) : undefined,
      rainfall: rainfall ? Number(rainfall) : undefined,
      issuedAt: PA.fromLocalInput(getFieldValue('issuedAt')),
      expiresAt: expiresAt ? PA.fromLocalInput(expiresAt) : undefined,
      status: getFieldValue('status')
    };
  }

  function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateForm()) return;

    var data = readFormData();

    if (editing) {
      data.id = editing.id;
      alerts = alerts.map(function (alert) {
        return alert.id === editing.id ? data : alert;
      });
      PA.showToast('Alerta atualizado com sucesso.');
    } else {
      data.id = PA.genId();
      alerts = [data].concat(alerts);
      PA.showToast('Alerta publicado com sucesso.');
    }

    persist();
    formDialog.close();
    render();
  }

  function openDeleteConfirmation(alert) {
    pendingDeleteId = alert.id;
    $('#confirm-text').textContent =
      'Tem certeza de que deseja excluir o alerta "' + alert.title + '"? Esta ação não pode ser desfeita.';
    confirmDialog.open();
  }

  function handleTableClick(e) {
    var editButton = e.target.closest('[data-edit]');
    var deleteButton = e.target.closest('[data-delete]');
    var alert;

    if (editButton) {
      alert = findAlert(editButton.getAttribute('data-edit'));
      if (alert) openForm(alert);
    } else if (deleteButton) {
      alert = findAlert(deleteButton.getAttribute('data-delete'));
      if (alert) openDeleteConfirmation(alert);
    }
  }

  function handleDeleteConfirm() {
    var id = pendingDeleteId;

    confirmDialog.close();
    alerts = alerts.filter(function (alert) {
      return alert.id !== id;
    });

    persist();
    PA.showToast('Alerta excluído com sucesso.');
    render();
  }

  function bindFilters() {
    $all('[data-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        adminFilter = button.getAttribute('data-filter');
        render();
      });
    });
  }

  if (session.username) {
    $('#admin-user').textContent = '— ' + session.username;
  }

  form.addEventListener('submit', handleFormSubmit);
  $('#create-alert').addEventListener('click', function () {
    openForm();
  });
  table.addEventListener('click', handleTableClick);
  $('#confirm-cancel').addEventListener('click', confirmDialog.close);
  $('#confirm-ok').addEventListener('click', handleDeleteConfirm);

  bindFilters();
  render();
})();