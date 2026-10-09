"""Coleta ANA + CEMADEN, mescla as estacoes de cada municipio e gera assets/js/data.js.

Uso:
    python scripts/coletar.py            # coleta de verdade (precisa das variaveis de ambiente)
    python scripts/coletar.py --vazio    # gera data.js sem dados (estado inicial do repositorio)

Se uma fonte falhar, o municipio fica marcado como 'semDados' (nunca inventa valor).
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import clientes as c  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / "config" / "estacoes.json"
SAIDA = RAIZ / "assets" / "js" / "data.js"
HISTORICO = RAIZ / ".cache" / "cemaden_historico.json"
HORAS_HISTORICO = 36
NIVEIS = {"normal": 0, "atencao": 1, "critico": 2}
NOME_NIVEL = {v: k for k, v in NIVEIS.items()}


# ------------------------------------------------------------------ calculos
def _media(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _pontos_tempo(agora_utc, n, passo_h):
    """n+1 instantes alinhados na hora cheia (hora local de Brasilia), do mais antigo ao mais novo."""
    local = agora_utc.astimezone(c.BRT).replace(minute=0, second=0, microsecond=0)
    fim = local.astimezone(c.UTC)
    return [fim - timedelta(hours=passo_h * (n - i)) for i in range(n + 1)]


def serie_chuva(estacoes_regs, instantes, passo_h):
    """Soma por intervalo (t-passo, t] em cada estacao; mescla as estacoes pela media
    (so entram estacoes com leitura naquele intervalo)."""
    saida = []
    for t in instantes:
        ini = t - timedelta(hours=passo_h)
        por_estacao = []
        for regs in estacoes_regs:
            v = [r["chuva"] for r in regs if r["chuva"] is not None and ini < r["t"] <= t]
            if v:
                por_estacao.append(sum(v))
        saida.append(_media(por_estacao))
    return saida


def chuva_total(estacoes_regs, agora, horas):
    ini = agora - timedelta(hours=horas)
    totais = []
    for regs in estacoes_regs:
        v = [r["chuva"] for r in regs if r["chuva"] is not None and ini < r["t"] <= agora]
        if v:
            totais.append(sum(v))
    return _media(totais)


def serie_nivel(regs, instantes, tolerancia_h=3):
    """Ultimo nivel conhecido ate cada instante (ate `tolerancia_h` de defasagem)."""
    com = [r for r in regs if r["nivel"] is not None]
    saida = []
    for t in instantes:
        cand = [r for r in com if t - timedelta(hours=tolerancia_h) <= r["t"] <= t]
        saida.append(cand[-1]["nivel"] if cand else None)
    return saida


def preencher(vals):
    """Preenche buracos repetindo o vizinho (para o grafico nao quebrar)."""
    if all(v is None for v in vals):
        return []
    out, ult = [], None
    for v in vals:
        ult = v if v is not None else ult
        out.append(ult)
    prim = next(v for v in out if v is not None)
    return [prim if v is None else v for v in out]


def classificar(cfg, chuva24, nivel, variacao):
    lim = cfg["limiares"]
    n, motivos = 0, []

    def aplica(valor, par, nome):
        nonlocal n
        if valor is None or not par:
            return
        if par.get("critico") is not None and valor >= par["critico"]:
            n = max(n, 2); motivos.append(f"{nome} em nivel critico")
        elif par.get("atencao") is not None and valor >= par["atencao"]:
            n = max(n, 1); motivos.append(f"{nome} em nivel de atencao")

    aplica(chuva24, lim.get("chuva_24h_mm"), "chuva acumulada")
    aplica(nivel, lim.get("cota_nivel_m"), "nivel do rio")
    aplica(variacao, lim.get("variacao_nivel_m"), "variacao do nivel")
    return NOME_NIVEL[n], motivos


def _ajustar_cota(cfg, regs):
    """A 'cota' da ANA pode ser a leitura da regua (poucos metros) ou uma altitude (dezenas de metros).
    Se parecer altitude (ou se config pedir 'relativo'), mostra o nivel acima do MENOR valor dos dados
    recebidos (7 dias). A variacao e o formato do grafico nao mudam."""
    modo = cfg.get("ana_nivel_modo", "auto")
    vals = [r["nivel"] for r in regs if r["nivel"] is not None]
    if not vals:
        return regs, False
    if modo == "relativo" or (modo == "auto" and max(vals) > 15):
        base = min(vals)
        return [dict(r, nivel=None if r["nivel"] is None else r["nivel"] - base) for r in regs], True
    return regs, False


def calcular_municipio(cfg, mun, cem_regs, ana_regs, agora):
    """cem_regs: lista (por estacao) de registros CEMADEN; ana_regs: idem ANA."""
    passo = cfg["passo_horas"]
    n = cfg["janela_horas"] // passo
    inst = _pontos_tempo(agora, n, passo)
    rotulos = [t.astimezone(c.BRT).strftime("%Hh") for t in inst]

    # chuva: CEMADEN (mescla) quando ha ~24 h de historico; senao ANA; senao CEMADEN parcial
    def frescas(lista):
        return [rs for rs in lista if rs and max(r["t"] for r in rs) >= agora - timedelta(hours=6)]

    def cobertura_h(rs):
        ts = [r["t"] for r in rs]
        return (max(ts) - min(ts)).total_seconds() / 3600 if len(ts) > 1 else 0

    cem_chuva = frescas([[r for r in rs if r["chuva"] is not None] for rs in cem_regs])
    ana_chuva = frescas([[{"t": r["t"], "chuva": r["chuva"]} for r in rs if r["chuva"] is not None] for rs in ana_regs])
    if cem_chuva and max(cobertura_h(rs) for rs in cem_chuva) >= cfg["janela_horas"] - 4:
        fontes_chuva, fonte_chuva = cem_chuva, "CEMADEN"
    elif ana_chuva:
        fontes_chuva, fonte_chuva = ana_chuva, "ANA"
    elif cem_chuva:
        fontes_chuva, fonte_chuva = cem_chuva, "CEMADEN"
    else:
        fontes_chuva, fonte_chuva = [], ""
    chuva24 = chuva_total(fontes_chuva, agora, cfg["janela_horas"])
    sc = serie_chuva(fontes_chuva, inst, passo)
    rain_series = ([{"hour": h, "mm": round(v if v is not None else 0.0, 1)} for h, v in zip(rotulos, sc)]
                   if chuva24 is not None else [])

    # rio: estacao ANA com leitura mais recente
    ana_com_nivel = [rs for rs in ana_regs if any(r["nivel"] is not None for r in rs)]
    ana_com_nivel.sort(key=lambda rs: max(r["t"] for r in rs if r["nivel"] is not None), reverse=True)
    nivel_atual = variacao = None
    relativo = False
    river_series = []
    if ana_com_nivel:
        regs = ana_com_nivel[0]
        regs, relativo = _ajustar_cota(cfg, regs)
        sn = preencher(serie_nivel(regs, inst))
        river_series = [{"hour": h, "m": round(v, 2)} for h, v in zip(rotulos, sn)]
        ult = [r for r in regs if r["nivel"] is not None][-1]
        if agora - ult["t"] <= timedelta(hours=6):
            nivel_atual = round(ult["nivel"], 2)
            ref = serie_nivel(regs, [ult["t"] - timedelta(hours=cfg["variacao_horas"])], tolerancia_h=2)[0]
            variacao = round(ult["nivel"] - ref, 2) if ref is not None else None

    # clima: leitura mais recente (ate 3 h) de cada estacao CEMADEN, mescladas pela media
    def ultimo(campo):
        vs = []
        for rs in cem_regs:
            cand = [r for r in rs if r[campo] is not None and agora - r["t"] <= timedelta(hours=3)]
            if cand:
                vs.append(cand[-1][campo])
        return _media(vs)
    temp, umid = ultimo("temp"), ultimo("umid")

    marcas = [r["t"] for rs in cem_regs for r in rs] + [r["t"] for rs in ana_regs for r in rs]
    tem_dado = chuva24 is not None or nivel_atual is not None or temp is not None
    nivel_risco, motivos = classificar(cfg, chuva24, nivel_atual, variacao)
    fontes = []
    if fonte_chuva:
        fontes.append(fonte_chuva)
    if any(r["nivel"] is not None for rs in ana_regs for r in rs) and "ANA" not in fontes:
        fontes.append("ANA")
    if (temp is not None or umid is not None) and "CEMADEN" not in fontes:
        fontes.append("CEMADEN")
    return {
        "id": mun["id"], "name": mun["nome"], "state": "RS",
        "level": nivel_risco if tem_dado else "normal",
        "semDados": not tem_dado,
        "motivos": motivos,
        "rainfall24h": None if chuva24 is None else round(chuva24, 1),
        "riverLevel": nivel_atual,
        "riverRelativo": relativo,
        "riverLevelChange": variacao,
        "temperature": None if temp is None else round(temp, 1),
        "humidity": None if umid is None else round(umid),
        "lastUpdate": (max(marcas).astimezone(c.BRT).isoformat() if marcas else None),
        "fonte": " + ".join(fontes),
        "rainfallSeries": rain_series, "riverSeries": river_series,
    }


def alertas_automaticos(municipios):
    out = []
    for m in municipios:
        if m["semDados"] or m["level"] == "normal":
            continue
        crit = m["level"] == "critico"
        out.append({
            "id": f"auto-{m['id']}-{m['level']}", "level": m["level"], "municipality": m["name"],
            "title": "Alerta crítico gerado pelos dados monitorados" if crit else "Indicadores acima do padrão habitual",
            "message": ("Os dados das estações indicam " + " e ".join(m["motivos"]) + ". "
                        "Alerta automático, baseado em limiares provisórios; confirme com a Defesa Civil."),
            "riverLevel": m["riverLevel"], "rainfall": m["rainfall24h"],
            "issuedAt": m["lastUpdate"] or datetime.now(c.BRT).isoformat(), "status": "ativo",
        })
    return out


def escrever_data_js(municipios, alertas, meta):
    corpo = ("// ARQUIVO GERADO por scripts/coletar.py — nao edite a mao.\n"
             "(function () {\n"
             f"  window.municipalities = {json.dumps(municipios, ensure_ascii=False, indent=2)};\n"
             f"  window.seedAlerts = {json.dumps(alertas, ensure_ascii=False, indent=2)};\n"
             f"  window.dadosMeta = {json.dumps(meta, ensure_ascii=False)};\n"
             "})();\n")
    SAIDA.write_text(corpo, encoding="utf-8")


# ---------------------------------------------------------------------- main
def coletar(cfg, agora):
    cem_cache, ana_cache, erros = {}, {}, []
    precisa_cem = any(m["cemaden"] for m in cfg["municipios"])
    precisa_ana = any(m["ana"] for m in cfg["municipios"])
    tok_cem = tok_ana = None
    if precisa_cem:
        try:
            tok_cem = c.cemaden_token()
        except Exception as e:  # noqa: BLE001
            erros.append(f"CEMADEN token: {e}")
    if precisa_ana:
        try:
            tok_ana = c.ana_token()
        except Exception as e:  # noqa: BLE001
            erros.append(f"ANA token: {type(e).__name__}")
    fuso_cem = c.UTC if cfg.get("cemaden_fuso", "UTC") == "UTC" else c.BRT
    fuso_ana = c.UTC if cfg.get("ana_fuso", "BRT") == "UTC" else c.BRT

    for m in cfg["municipios"]:
        for cod in m["cemaden"]:
            if cod not in cem_cache and tok_cem:
                try:
                    cem_cache[cod] = c.normalizar_cemaden(c.cemaden_dados_recentes(tok_cem, cod), fuso_cem)
                except Exception as e:  # noqa: BLE001
                    erros.append(f"CEMADEN {cod}: {type(e).__name__}")
        for cod in m["ana"]:
            if cod not in ana_cache and tok_ana:
                try:
                    ana_cache[cod] = c.normalizar_ana(c.ana_serie(tok_ana, cod), fuso_ana, cfg.get("ana_nivel_unidade", "auto"))
                except Exception as e:  # noqa: BLE001
                    erros.append(f"ANA {cod}: {type(e).__name__}")
    return cem_cache, ana_cache, erros


def acumular_historico(cem_cache, agora):
    """A API do CEMADEN devolve so ~1-2 h por estacao. Guardamos as leituras entre execucoes
    (cache do GitHub Actions) para formar a janela de 24 h."""
    try:
        antigo = json.loads(HISTORICO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        antigo = {}
    corte = agora - timedelta(hours=HORAS_HISTORICO)

    def ler(r):
        return {"t": datetime.fromisoformat(r["t"]), "chuva": r["chuva"], "temp": r["temp"], "umid": r["umid"]}

    novo = {}
    for cod in set(antigo) | set(cem_cache):
        por_t = {x["t"]: x for x in map(ler, antigo.get(cod, [])) if x["t"] >= corte}
        for r in cem_cache.get(cod, []):
            if r["t"] >= corte:
                por_t[r["t"]] = r
        novo[cod] = sorted(por_t.values(), key=lambda x: x["t"])
    HISTORICO.parent.mkdir(exist_ok=True)
    HISTORICO.write_text(json.dumps({k: [dict(r, t=r["t"].isoformat()) for r in v] for k, v in novo.items()}), encoding="utf-8")
    return novo


def montar(cfg, cem_cache, ana_cache, agora):
    muns = []
    for m in cfg["municipios"]:
        cem = [cem_cache[x] for x in m["cemaden"] if cem_cache.get(x)]
        ana = [ana_cache[x] for x in m["ana"] if ana_cache.get(x)]
        muns.append(calcular_municipio(cfg, m, cem, ana, agora))
    return muns


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    agora = datetime.now(c.UTC)
    if "--vazio" in sys.argv:
        cem, ana, erros = {}, {}, []
    else:
        cem, ana, erros = coletar(cfg, agora)
        print(f"Token CEMADEN: {c.INFO['token']}")
        cem = acumular_historico(cem, agora)
    muns = montar(cfg, cem, ana, agora)
    meta = {"geradoEm": agora.astimezone(c.BRT).isoformat(), "fontes": ["ANA", "CEMADEN"],
            "municipiosComDados": sum(1 for m in muns if not m["semDados"])}
    escrever_data_js(muns, alertas_automaticos(muns), meta)

    print(f"data.js gerado: {meta['municipiosComDados']}/{len(muns)} municipios com dados")
    for m in muns:
        print(f"  - {m['name']}: {'SEM DADOS' if m['semDados'] else m['level']} ({m['fonte'] or '-'})")
    for e in erros:
        print(f"  ! {e}")
    # Falha o job somente se NADA foi coletado numa execucao real (evita publicar site vazio por engano)
    if "--vazio" not in sys.argv and meta["municipiosComDados"] == 0:
        print("Nenhum municipio com dados: abortando para nao publicar painel vazio.")
        sys.exit(1)


if __name__ == "__main__":
    main()
