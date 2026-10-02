(function () {
  function buildRainfallSeries(base, spike) {
    var out = [];
    for (var i = 0; i < 13; i++) {
      var hour = String(i * 2).padStart(2, '0') + 'h';
      var wave = Math.sin((i / 12) * Math.PI) * spike;
      var noise = (i % 3 === 0 ? 1 : -1) * (base * 0.15);
      var value = Math.max(0, base * 0.3 + wave + noise);
      out.push({ hour: hour, mm: Number(value.toFixed(1)) });
    }
    return out;
  }
  function buildRiverSeries(base, trend) {
    var out = [];
    for (var i = 0; i < 13; i++) {
      var hour = String(i * 2).padStart(2, '0') + 'h';
      var value = base + (trend * i) / 12 + Math.sin(i / 2) * 0.03;
      out.push({ hour: hour, m: Number(value.toFixed(2)) });
    }
    return out;
  }
  window.municipalities = [
    { id: 'tres-coroas', name: 'Três Coroas', state: 'RS', level: 'atencao', rainfall24h: 42.5, riverLevel: 2.34, riverLevelChange: 0.18, temperature: 21.4, humidity: 78, lastUpdate: '2026-09-27T08:40:00-03:00', rainfallSeries: buildRainfallSeries(42.5, 6), riverSeries: buildRiverSeries(2.05, 0.29) },
    { id: 'igrejinha', name: 'Igrejinha', state: 'RS', level: 'atencao', rainfall24h: 37.2, riverLevel: 1.98, riverLevelChange: 0.11, temperature: 21.8, humidity: 75, lastUpdate: '2026-09-27T08:35:00-03:00', rainfallSeries: buildRainfallSeries(37.2, 5), riverSeries: buildRiverSeries(1.82, 0.16) },
    { id: 'taquara', name: 'Taquara', state: 'RS', level: 'normal', rainfall24h: 12.6, riverLevel: 1.41, riverLevelChange: 0.02, temperature: 22.6, humidity: 64, lastUpdate: '2026-09-27T08:30:00-03:00', rainfallSeries: buildRainfallSeries(12.6, 2), riverSeries: buildRiverSeries(1.38, 0.03) },
    { id: 'gramado', name: 'Gramado', state: 'RS', level: 'normal', rainfall24h: 9.4, riverLevel: 1.12, riverLevelChange: -0.01, temperature: 17.9, humidity: 69, lastUpdate: '2026-09-27T08:32:00-03:00', rainfallSeries: buildRainfallSeries(9.4, 1.5), riverSeries: buildRiverSeries(1.13, -0.02) },
    { id: 'canela', name: 'Canela', state: 'RS', level: 'normal', rainfall24h: 10.8, riverLevel: 1.2, riverLevelChange: 0.0, temperature: 17.5, humidity: 71, lastUpdate: '2026-09-27T08:33:00-03:00', rainfallSeries: buildRainfallSeries(10.8, 1.5), riverSeries: buildRiverSeries(1.2, 0.0) }
  ];
  window.seedAlerts = [
    { id: 'seed-1', level: 'critico', municipality: 'Três Coroas', title: 'Elevação do nível do Rio Paranhana', message: 'Monitoramento indica elevação contínua do nível do rio nas últimas horas, associada a chuva acumulada acima da média. Recomenda-se atenção redobrada em áreas historicamente afetadas por inundações.', riverLevel: 2.34, rainfall: 42.5, issuedAt: '2026-09-27T07:15:00-03:00', expiresAt: '2026-09-27T19:15:00-03:00', status: 'ativo' },
    { id: 'seed-2', level: 'atencao', municipality: 'Igrejinha', title: 'Aumento gradual da precipitação acumulada', message: 'Volume de chuva acumulado nas últimas 24 horas está acima do padrão esperado para o período. Situação será acompanhada nas próximas horas.', riverLevel: 1.98, rainfall: 37.2, issuedAt: '2026-09-27T06:50:00-03:00', status: 'ativo' },
    { id: 'seed-3', level: 'normal', municipality: 'Taquara', title: 'Condições dentro da normalidade', message: 'Indicadores hidrometeorológicos monitorados permanecem dentro da faixa considerada normal para a região.', riverLevel: 1.41, rainfall: 12.6, issuedAt: '2026-09-26T20:00:00-03:00', expiresAt: '2026-09-27T08:00:00-03:00', status: 'encerrado' }
  ];
})();
