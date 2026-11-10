window.demoAtivo = false;

(function () {
  'use strict';

  var SERIES_POINTS = 13;
  var SERIES_LAST_INDEX = SERIES_POINTS - 1;
  var HOURS_PER_POINT = 2;
  var MS_PER_HOUR = 3600 * 1000;

  function formatHour(index) {
    return String(index * HOURS_PER_POINT).padStart(2, '0') + 'h';
  }

  function hoursAgo(hours) {
    return new Date(Date.now() - hours * MS_PER_HOUR).toISOString();
  }

  function buildRainfallSeries(base, spike) {
    var series = [];

    for (var i = 0; i < SERIES_POINTS; i++) {
      var wave = Math.sin((i / SERIES_LAST_INDEX) * Math.PI) * spike;
      var noise = (i % 3 === 0 ? 1 : -1) * (base * 0.15);
      var value = Math.max(0, base * 0.3 + wave + noise);

      series.push({ hour: formatHour(i), mm: Number(value.toFixed(1)) });
    }

    return series;
  }

  function buildRiverSeries(base, trend) {
    var series = [];

    for (var i = 0; i < SERIES_POINTS; i++) {
      var value = base + (trend * i) / SERIES_LAST_INDEX + Math.sin(i / 2) * 0.03;

      series.push({ hour: formatHour(i), m: Number(value.toFixed(2)) });
    }

    return series;
  }

  function buildMunicipality(id, name, level, rain, river, change, temp, hum, spike, riverBase, trend) {
    return {
      id: id,
      name: name,
      state: 'RS',
      level: level,
      semDados: false,
      demo: true,
      motivos: [],
      rainfall24h: rain,
      riverLevel: river,
      riverRelativo: false,
      riverLevelChange: change,
      temperature: temp,
      humidity: hum,
      lastUpdate: null,
      fonte: 'Demonstração',
      rainfallSeries: buildRainfallSeries(rain, spike),
      riverSeries: buildRiverSeries(riverBase, trend)
    };
  }

  window.demoMunicipalities = [
    buildMunicipality('tres-coroas', 'Três Coroas', 'atencao', 42.5, 2.34, 0.18, 21.4, 78, 6, 2.05, 0.29),
    buildMunicipality('igrejinha', 'Igrejinha', 'atencao', 37.2, 1.98, 0.11, 21.8, 75, 5, 1.82, 0.16),
    buildMunicipality('taquara', 'Taquara', 'normal', 12.6, 1.41, 0.02, 22.6, 64, 2, 1.38, 0.03),
    buildMunicipality('gramado', 'Gramado', 'normal', 9.4, 1.12, -0.01, 17.9, 69, 1.5, 1.13, -0.02),
    buildMunicipality('canela', 'Canela', 'normal', 10.8, 1.2, 0.0, 17.5, 71, 1.5, 1.2, 0.0)
  ];

  window.demoAlerts = [
    {
      id: 'auto-demo-1',
      level: 'critico',
      municipality: 'Três Coroas',
      title: '[Demonstração] Elevação do nível do Rio Paranhana',
      message: 'Exemplo ilustrativo: elevação contínua do nível do rio nas últimas horas, associada a chuva acumulada acima da média. Não corresponde a uma condição real.',
      riverLevel: 2.34,
      rainfall: 42.5,
      issuedAt: hoursAgo(2),
      expiresAt: hoursAgo(-10),
      status: 'ativo'
    },
    {
      id: 'auto-demo-2',
      level: 'atencao',
      municipality: 'Igrejinha',
      title: '[Demonstração] Aumento gradual da precipitação acumulada',
      message: 'Exemplo ilustrativo: volume de chuva acumulado nas últimas 24 horas acima do padrão. Não corresponde a uma condição real.',
      riverLevel: 1.98,
      rainfall: 37.2,
      issuedAt: hoursAgo(3),
      status: 'ativo'
    },
    {
      id: 'auto-demo-3',
      level: 'normal',
      municipality: 'Taquara',
      title: '[Demonstração] Condições dentro da normalidade',
      message: 'Exemplo ilustrativo: indicadores dentro da faixa considerada normal para a região.',
      riverLevel: 1.41,
      rainfall: 12.6,
      issuedAt: hoursAgo(14),
      expiresAt: hoursAgo(2),
      status: 'encerrado'
    }
  ];

  if (window.demoAtivo && !(window.seedAlerts || []).length) {
    window.seedAlerts = window.demoAlerts;
  }
})();