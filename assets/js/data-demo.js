/* DADOS DEMONSTRATIVOS (FICTICIOS) — usados so para apresentacao.
 *
 * Quando um municipio nao tem leituras reais (ANA/CEMADEN), o painel mostra estes valores,
 * sempre identificados como "Dados demonstrativos". Municipios com dados reais nunca sao trocados.
 *
 * Para DESLIGAR a demonstracao (producao), troque a linha abaixo por:  window.demoAtivo = false;
 */
window.demoAtivo = true;

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
  function mun(id, name, level, rain, river, change, temp, hum, spike, riverBase, trend) {
    return {
      id: id, name: name, state: 'RS', level: level, semDados: false, demo: true, motivos: [],
      rainfall24h: rain, riverLevel: river, riverRelativo: false, riverLevelChange: change,
      temperature: temp, humidity: hum, lastUpdate: null, fonte: 'Demonstração',
      rainfallSeries: buildRainfallSeries(rain, spike), riverSeries: buildRiverSeries(riverBase, trend)
    };
  }

  window.demoMunicipalities = [
    mun('tres-coroas', 'Três Coroas', 'atencao', 42.5, 2.34, 0.18, 21.4, 78, 6, 2.05, 0.29),
    mun('igrejinha', 'Igrejinha', 'atencao', 37.2, 1.98, 0.11, 21.8, 75, 5, 1.82, 0.16),
    mun('taquara', 'Taquara', 'normal', 12.6, 1.41, 0.02, 22.6, 64, 2, 1.38, 0.03),
    mun('gramado', 'Gramado', 'normal', 9.4, 1.12, -0.01, 17.9, 69, 1.5, 1.13, -0.02),
    mun('canela', 'Canela', 'normal', 10.8, 1.2, 0.0, 17.5, 71, 1.5, 1.2, 0.0)
  ];

  function ago(h) { return new Date(Date.now() - h * 3600 * 1000).toISOString(); }
  // ids com prefixo "auto-" nao ficam salvos no navegador: somem sozinhos quando a demonstracao e desligada
  window.demoAlerts = [
    { id: 'auto-demo-1', level: 'critico', municipality: 'Três Coroas', title: '[Demonstração] Elevação do nível do Rio Paranhana', message: 'Exemplo ilustrativo: elevação contínua do nível do rio nas últimas horas, associada a chuva acumulada acima da média. Não corresponde a uma condição real.', riverLevel: 2.34, rainfall: 42.5, issuedAt: ago(2), expiresAt: ago(-10), status: 'ativo' },
    { id: 'auto-demo-2', level: 'atencao', municipality: 'Igrejinha', title: '[Demonstração] Aumento gradual da precipitação acumulada', message: 'Exemplo ilustrativo: volume de chuva acumulado nas últimas 24 horas acima do padrão. Não corresponde a uma condição real.', riverLevel: 1.98, rainfall: 37.2, issuedAt: ago(3), status: 'ativo' },
    { id: 'auto-demo-3', level: 'normal', municipality: 'Taquara', title: '[Demonstração] Condições dentro da normalidade', message: 'Exemplo ilustrativo: indicadores dentro da faixa considerada normal para a região.', riverLevel: 1.41, rainfall: 12.6, issuedAt: ago(14), expiresAt: ago(2), status: 'encerrado' }
  ];

  if (window.demoAtivo && !(window.seedAlerts || []).length) window.seedAlerts = window.demoAlerts;
})();
