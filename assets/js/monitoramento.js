(function () {
  'use strict';

  var PA = window.PA;
  var $ = PA.$;
  var $all = PA.$all;
  var esc = PA.esc;
  var num = PA.num;

  var CHART_HEIGHT = 260;

  var STATUS_DESCRIPTIONS = {
    normal: 'Os indicadores monitorados estão dentro da faixa considerada normal para a região.',
    atencao: 'Indicadores acima do padrão habitual. Recomenda-se acompanhar a evolução das condições.',
    critico: 'Indicadores em nível elevado, associados a maior risco de inundação. Recomenda-se atenção redobrada.'
  };

  var LEVEL_LABELS = {
    normal: 'Normal',
    atencao: 'Atenção',
    critico: 'Crítico'
  };

  var EMPTY_CHART_HTML =
    '<p class="chart-empty" style="padding:48px 8px;text-align:center;color:var(--color-slate)">' +
    'Sem leituras recentes das estações para este gráfico.</p>';

  var state = {
    selectedId: PA.sGet(localStorage, PA.KEYS.municipality) || 'tres-coroas',
    levelFilter: 'todos',
    municipalityFilter: 'todos',
    searchQuery: ''
  };

  var resizeTimer;

  function applyDemoData() {
    if (!window.demoAtivo || !window.demoMunicipalities) return;

    var demoById = {};
    window.demoMunicipalities.forEach(function (item) {
      demoById[item.id] = item;
    });

    window.municipalities = window.municipalities.map(function (m) {
      return m.semDados && demoById[m.id] ? demoById[m.id] : m;
    });
  }

  function getMunicipality(id) {
    return municipalities.filter(function (m) {
      return m.id === id;
    })[0];
  }

  function selected() {
    return getMunicipality(state.selectedId) || municipalities[0];
  }

  function hasModelFields(m) {
    return !!(m.modeloCampos && m.modeloCampos.length);
  }

  function niceTicks(min, max, count) {
    var span = max - min || 1;
    var raw = span / count;
    var magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    var normalized = raw / magnitude;
    var step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    var start = Math.floor(min / step) * step;
    var end = Math.ceil(max / step) * step;
    var ticks = [];

    for (var v = start; v <= end + step / 2; v += step) {
      ticks.push(Number(v.toFixed(6)));
    }

    return ticks;
  }

  function formatTick(value, unit) {
    return (Math.round(value * 100) / 100).toLocaleString('pt-BR') + unit;
  }

  function monotonePath(points) {
    var n = points.length;
    if (n < 2) return '';

    var i;
    var dx = [];
    var dy = [];
    var slopes = [];
    var tangents = [];

    for (i = 0; i < n - 1; i++) {
      dx[i] = points[i + 1][0] - points[i][0];
      dy[i] = points[i + 1][1] - points[i][1];
      slopes[i] = dy[i] / dx[i];
    }

    tangents[0] = slopes[0];
    tangents[n - 1] = slopes[n - 2];

    for (i = 1; i < n - 1; i++) {
      tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
    }

    for (i = 0; i < n - 1; i++) {
      if (slopes[i] === 0) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
        continue;
      }

      var a = tangents[i] / slopes[i];
      var b = tangents[i + 1] / slopes[i];
      var sum = a * a + b * b;

      if (sum > 9) {
        var k = 3 / Math.sqrt(sum);
        tangents[i] = k * a * slopes[i];
        tangents[i + 1] = k * b * slopes[i];
      }
    }

    var path = 'M' + points[0][0] + ',' + points[0][1];

    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      path += ' C' +
        (points[i][0] + h) + ',' + (points[i][1] + h * tangents[i]) + ' ' +
        (points[i + 1][0] - h) + ',' + (points[i + 1][1] - h * tangents[i + 1]) + ' ' +
        points[i + 1][0] + ',' + points[i + 1][1];
    }

    return path;
  }

  function drawChart(container, cfg) {
    var isBar = cfg.type === 'bar';
    var isArea = cfg.type === 'area';
    var W = Math.max(container.clientWidth, 240);
    var H = CHART_HEIGHT;
    var M = { top: 8, right: 8, bottom: 26, left: cfg.left };
    var pw = W - M.left - M.right;
    var ph = H - M.top - M.bottom;
    var n = cfg.data.length;
    var band = pw / n;

    var values = cfg.data.map(function (d) {
      return d[cfg.key];
    });

    var lo = isBar ? 0 : Math.min.apply(null, values) - 0.2;
    var hi = Math.max.apply(null, values) + (isBar ? 0 : 0.2);
    var noRain = isBar && hi <= 0;
    if (noRain) hi = 5;

    var ticks = niceTicks(lo, hi, 5);
    var dMin = isBar ? 0 : ticks[0] < lo ? lo : ticks[0];
    var dMax = isBar ? ticks[ticks.length - 1] : hi;

    if (isArea) {
      ticks = ticks.filter(function (t) {
        return t >= dMin - 1e-9 && t <= dMax + 1e-9;
      });
    }

    function yScale(v) {
      return M.top + ph - ((v - dMin) / (dMax - dMin || 1)) * ph;
    }

    function xScale(i) {
      return isBar ? M.left + band * i + band / 2 : M.left + (pw * i) / (n - 1);
    }

    var svg = '<svg width="100%" height="' + H + '" viewBox="0 0 ' + W + ' ' + H +
      '" aria-hidden="true" style="display:block;max-width:100%">';

    if (isArea) {
      svg += '<defs><linearGradient id="' + cfg.gradId + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="var(--color-brand-500)" stop-opacity="0.35"/>' +
        '<stop offset="100%" stop-color="var(--color-brand-500)" stop-opacity="0.02"/>' +
        '</linearGradient></defs>';
    }

    ticks.forEach(function (t) {
      var y = yScale(t);
      svg += '<line x1="' + M.left + '" x2="' + (W - M.right) + '" y1="' + y + '" y2="' + y +
        '" stroke="var(--color-line)" stroke-dasharray="3 3"/>';
      svg += '<text x="' + (M.left - 6) + '" y="' + (y + 4) +
        '" text-anchor="end" font-size="12" fill="var(--color-slate)">' + formatTick(t, cfg.unit) + '</text>';
    });

    svg += '<line x1="' + M.left + '" x2="' + (W - M.right) + '" y1="' + (M.top + ph) +
      '" y2="' + (M.top + ph) + '" stroke="var(--color-line)"/>';

    cfg.data.forEach(function (d, i) {
      svg += '<text x="' + xScale(i) + '" y="' + (H - 6) +
        '" text-anchor="middle" font-size="12" fill="var(--color-slate)">' + d.hour + '</text>';
    });

    if (noRain) {
      svg += '<text x="' + (M.left + pw / 2) + '" y="' + (M.top + ph / 2) +
        '" text-anchor="middle" font-size="14" fill="var(--color-slate)">Sem chuva registrada neste período</text>';
    }

    if (isBar) {
      var barWidth = Math.min(28, band * 0.7);

      cfg.data.forEach(function (d, i) {
        var x = xScale(i) - barWidth / 2;
        var y = yScale(d.mm);
        var h = M.top + ph - y;
        var r = Math.min(6, barWidth / 2, h);
        if (h <= 0) return;

        svg += '<path class="bar-item" data-i="' + i + '" fill="var(--color-brand-500)" d="M' + x + ',' + (y + h) +
          ' V' + (y + r) +
          ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
          ' H' + (x + barWidth - r) +
          ' Q' + (x + barWidth) + ',' + y + ' ' + (x + barWidth) + ',' + (y + r) +
          ' V' + (y + h) + ' Z"/>';
      });
    } else {
      var points = cfg.data.map(function (d, i) {
        return [xScale(i), yScale(d.m)];
      });
      var line = monotonePath(points);

      svg += '<path d="' + line + ' L' + points[n - 1][0] + ',' + (M.top + ph) +
        ' L' + points[0][0] + ',' + (M.top + ph) + ' Z" fill="url(#' + cfg.gradId + ')"/>';
      svg += '<path d="' + line + '" fill="none" stroke="var(--color-brand-600)" stroke-width="2.5"/>';
    }

    svg += '<line class="hover-line" x1="0" x2="0" y1="' + M.top + '" y2="' + (M.top + ph) +
      '" stroke="var(--color-line)" style="display:none"/>';
    svg += '<rect class="hover-area" x="' + M.left + '" y="' + M.top + '" width="' + pw +
      '" height="' + ph + '" fill="transparent"/></svg>';

    var tableRows = cfg.data.map(function (d) {
      return '<tr><td>' + d.hour + '</td><td>' + d[cfg.key] + '</td></tr>';
    }).join('');

    container.innerHTML =
      '<div class="chart-wrap" style="position:relative">' + svg +
      '<div class="chart-tip" style="display:none;position:absolute;pointer-events:none;padding:8px 12px;' +
      'border-radius:12px;border:1px solid var(--color-line);background:var(--color-surface);' +
      'color:var(--color-ink);font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.12);white-space:nowrap;z-index:2">' +
      '</div></div>' +
      '<table class="visually-hidden"><caption>' + cfg.caption + '</caption><thead><tr>' +
      '<th scope="col">Horário</th><th scope="col">' + cfg.colName + '</th></tr></thead>' +
      '<tbody>' + tableRows + '</tbody></table>';

    var wrap = $('.chart-wrap', container);
    var tip = $('.chart-tip', container);
    var hoverLine = $('.hover-line', container);
    var hoverArea = $('.hover-area', container);

    hoverArea.addEventListener('mousemove', function (e) {
      var rect = wrap.getBoundingClientRect();
      var px = e.clientX - rect.left;
      var index = isBar
        ? Math.floor((px - M.left) / band)
        : Math.round(((px - M.left) / pw) * (n - 1));
      index = Math.max(0, Math.min(n - 1, index));

      var d = cfg.data[index];
      tip.innerHTML =
        '<div style="font-weight:600;margin-bottom:2px">Horário: ' + d.hour + '</div>' +
        '<div style="color:var(--color-ink-soft)">' + cfg.tooltipName + ': ' + d[cfg.key] + cfg.tooltipUnit + '</div>';
      tip.style.display = 'block';

      var left = xScale(index) + 12;
      if (left + tip.offsetWidth > W) left = xScale(index) - tip.offsetWidth - 12;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = '16px';

      if (isArea) {
        hoverLine.setAttribute('x1', xScale(index));
        hoverLine.setAttribute('x2', xScale(index));
        hoverLine.style.display = '';
      }
    });

    hoverArea.addEventListener('mouseleave', function () {
      tip.style.display = 'none';
      hoverLine.style.display = 'none';
    });
  }

  function renderSeriesChart(container, series, valueKey, buildAriaLabel, config) {
    if (!container) return;

    if (series.length < 2) {
      container.removeAttribute('role');
      container.removeAttribute('aria-label');
      container.innerHTML = EMPTY_CHART_HTML;
      return;
    }

    var values = series.map(function (d) {
      return d[valueKey];
    });

    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', buildAriaLabel(Math.min.apply(null, values), Math.max.apply(null, values)));

    config.data = series;
    config.key = valueKey;
    drawChart(container, config);
  }

  function drawCharts() {
    var m = selected();

    renderSeriesChart(
      $('#chart-rain'),
      m.rainfallSeries,
      'mm',
      function (min, max) {
        return 'Gráfico de precipitação nas últimas 24 horas, variando de ' + min + ' a ' + max + ' milímetros.';
      },
      {
        type: 'bar',
        unit: ' mm',
        left: 60,
        caption: 'Precipitação por horário, em milímetros',
        colName: 'Precipitação (mm)',
        tooltipName: 'Precipitação',
        tooltipUnit: ' mm'
      }
    );

    renderSeriesChart(
      $('#chart-river'),
      m.riverSeries,
      'm',
      function (min, max) {
        return 'Gráfico do nível do Rio Paranhana ao longo do dia, variando de ' +
          min.toFixed(2) + ' a ' + max.toFixed(2) + ' metros.';
      },
      {
        type: 'area',
        unit: ' m',
        left: 56,
        gradId: 'riverGradient',
        caption: 'Nível do rio por horário, em metros',
        colName: 'Nível (m)',
        tooltipName: 'Nível do rio',
        tooltipUnit: ' m'
      }
    );
  }

  function scheduleRedraw() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCharts, 100);
  }

  function setupResizeHandling() {
    window.addEventListener('resize', scheduleRedraw);
    window.addEventListener('orientationchange', scheduleRedraw);

    if (!('ResizeObserver' in window)) return;

    var lastWidths = {};
    var observer = new ResizeObserver(function (entries) {
      var changed = false;

      entries.forEach(function (entry) {
        var width = Math.round(entry.contentRect.width);
        if (lastWidths[entry.target.id] !== width) {
          lastWidths[entry.target.id] = width;
          changed = true;
        }
      });

      if (changed) scheduleRedraw();
    });

    ['chart-rain', 'chart-river'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  function buildUpdatedText(m) {
    if (m.demo) return 'Dados demonstrativos (fictícios) — não refletem as condições reais.';
    if (!m.lastUpdate) return 'Sem leituras recentes das estações.';

    var text = 'Última atualização: ' + PA.formatDateTime(m.lastUpdate);
    if (m.fonte) text += ' · Fonte: ' + m.fonte;
    if (hasModelFields(m)) text += ' · Dado de modelo (não é estação): ' + m.modeloCampos.join(', ');
    if (m.riverRelativo) text += ' · Nível relativo ao mínimo dos últimos 7 dias';

    return text;
  }

  function buildBadgeText(m) {
    if (m.demo) return 'Dados demonstrativos (fictícios)';
    if (hasModelFields(m)) return 'ANA/CEMADEN + modelo Open-Meteo';
    return 'Dados reais (ANA/CEMADEN)';
  }

  function updateHeader(m) {
    $('#mun-title').textContent = m.name + '/' + m.state;
    $('#mun-updated').textContent = buildUpdatedText(m);

    var badgeText = $('#data-badge-text');
    if (badgeText) badgeText.textContent = buildBadgeText(m);
  }

  function updateStatus(m) {
    $('#status-badge').innerHTML = m.semDados ? '' : PA.riskBadge(m.level, 'lg');
    $('#status-desc').textContent = m.semDados
      ? 'Não há leituras recentes das estações deste município. Nenhum nível de risco é calculado sem dados.'
      : STATUS_DESCRIPTIONS[m.level];
  }

  function updateStats(m) {
    $('[data-stat="rain"]').textContent = num(m.rainfall24h);
    $('[data-stat="river"]').textContent = num(m.riverLevel);
    $('[data-stat="change"]').textContent = (m.riverLevelChange > 0 ? '+' : '') + num(m.riverLevelChange);
    $('[data-stat="temp"]').textContent = num(m.temperature);
    $('[data-stat="hum"]').textContent = num(m.humidity);
    $('#stat-change-card').classList.toggle('stat-card--atencao', m.riverLevelChange > 0.15);
  }

  function updateMap(m) {
    $all('[data-map-id]').forEach(function (group) {
      var id = group.getAttribute('data-map-id');
      var isSelected = id === m.id;
      var halo = $('.map-halo', group);
      var dot = $('.map-dot', group);
      var item = getMunicipality(id);
      var color = !item || item.semDados ? 'var(--color-slate)' : 'var(--color-risk-' + item.level + ')';

      halo.setAttribute('display', isSelected ? 'inline' : 'none');
      dot.setAttribute('r', isSelected ? 10 : 8);
      halo.setAttribute('fill', color);
      dot.setAttribute('fill', color);
    });
  }

  function updateMunicipality() {
    var m = selected();

    updateHeader(m);
    updateStatus(m);
    updateStats(m);
    updateMap(m);
    drawCharts();
  }

  function choose(id) {
    var m = getMunicipality(id);

    state.selectedId = id;
    PA.sSet(localStorage, PA.KEYS.municipality, id);
    state.searchQuery = m ? m.name : '';
    $('#municipality-search-input').value = state.searchQuery;

    updateMunicipality();
  }

  function bindSearch() {
    var input = $('#municipality-search-input');
    var list = $('#msearch-list');
    var active = -1;
    var open = false;
    var results = [];

    function refresh() {
      var query = state.searchQuery.trim().toLowerCase();

      results = municipalities.filter(function (m) {
        return m.name.toLowerCase().indexOf(query) !== -1;
      });

      var emptyHtml = results.length === 0
        ? '<li class="municipality-search__empty">Nenhum município encontrado.</li>'
        : '';

      var optionsHtml = results.map(function (m, i) {
        return '<li role="option" aria-selected="' + (i === active) + '">' +
          '<button type="button" class="municipality-search__option' + (i === active ? ' is-active' : '') +
          '" data-mid="' + m.id + '">' +
          '<span>' + esc(m.name) + '</span>' +
          '<span class="option-level option-level--' + m.level + '">' +
          (m.semDados ? 'Sem dados' : LEVEL_LABELS[m.level]) + '</span>' +
          '</button></li>';
      }).join('');

      list.innerHTML = emptyHtml + optionsHtml;
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
    }

    input.addEventListener('input', function () {
      state.searchQuery = input.value;
      open = true;
      active = -1;
      refresh();
    });

    input.addEventListener('focus', function () {
      open = true;
      refresh();
    });

    input.addEventListener('blur', function () {
      setTimeout(function () {
        open = false;
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
      }, 120);
    });

    input.addEventListener('keydown', function (e) {
      if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        open = true;
        refresh();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        active = Math.min(active + 1, results.length - 1);
        refresh();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(active - 1, 0);
        refresh();
      } else if (e.key === 'Enter') {
        if (active >= 0 && results[active]) {
          e.preventDefault();
          choose(results[active].id);
        }
      } else if (e.key === 'Escape') {
        open = false;
        refresh();
      }
    });

    list.addEventListener('mousedown', function (e) {
      var button = e.target.closest('[data-mid]');
      if (!button) return;

      e.preventDefault();
      choose(button.getAttribute('data-mid'));
    });

    $all('[data-map-id]').forEach(function (group) {
      group.addEventListener('click', function () {
        choose(group.getAttribute('data-map-id'));
      });

      group.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose(group.getAttribute('data-map-id'));
        }
      });
    });
  }

  function renderAlerts() {
    var filtered = PA.loadAlerts().filter(function (alert) {
      var matchesLevel = state.levelFilter === 'todos' || alert.level === state.levelFilter;
      var matchesMunicipality = state.municipalityFilter === 'todos' || alert.municipality === state.municipalityFilter;
      return matchesLevel && matchesMunicipality;
    });

    var grid = $('#alert-grid');
    grid.innerHTML = filtered.map(PA.alertCard).join('');
    grid.hidden = filtered.length === 0;
    $('#alert-empty').hidden = filtered.length !== 0;
  }

  function bindFilters() {
    $('#filter-municipio').addEventListener('change', function (e) {
      state.municipalityFilter = e.target.value;
      renderAlerts();
    });

    $('#filter-nivel').addEventListener('change', function (e) {
      state.levelFilter = e.target.value;
      renderAlerts();
    });
  }

  applyDemoData();
  setupResizeHandling();
  bindFilters();
  bindSearch();
  updateMunicipality();
  renderAlerts();
})();