"""Teste offline do pipeline com respostas SIMULADAS (nao acessa a internet).
Rode:  python tests/teste_pipeline.py
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import clientes as c
import coletar as col

agora = datetime(2026, 10, 7, 14, 20, tzinfo=c.UTC)
cfg = json.loads(col.CONFIG.read_text(encoding="utf-8"))

# CEMADEN formato largo (UTC), 3 estacoes, 10/10 min nas ultimas 26 h; uma tem sentinela -999
def cem(base, temp=True):
    out = []
    for i in range(26 * 6):
        t = agora - timedelta(minutes=10 * i)
        reg = {"datahora": t.strftime("%Y-%m-%d %H:%M:%S.0"), "chuva": "-999" if i == 5 else str(base)}
        if temp:
            reg.update({"temperatura": "20,5", "umidade": "80"})
        out.append(reg)
    return out

cem_cache = {
    "432170903A": c.normalizar_cemaden(cem(0.4)),            # 0,4 mm/10min -> 57,6 mm/24h
    "432170902A": c.normalizar_cemaden(cem(0.3, False)),
    "432170901A": c.normalizar_cemaden({"dados": []}),         # estacao sem dados
}
# ANA: nivel em cm, hora local, subindo 0,05 m/h
ana_items = []
for i in range(7 * 24 * 4):
    t_local = (agora - timedelta(minutes=15 * i)).astimezone(c.BRT)
    ana_items.append({"Codigoestacao": "87366500", "Data_Hora_Medicao": t_local.strftime("%Y-%m-%d %H:%M:%S.0"),
                      "Nivel_Adotado": str(int(200 + 5 * (-(15 * i) / 60) * -1 * -1)), "Chuva_Adotada": ""})
ana_cache = {"87366500": c.normalizar_ana({"items": ana_items})}

muns = col.montar(cfg, cem_cache, ana_cache, agora)
tc = next(m for m in muns if m["id"] == "tres-coroas")
print(json.dumps({k: tc[k] for k in ("level", "rainfall24h", "riverLevel", "riverLevelChange", "temperature", "humidity", "lastUpdate", "fonte", "motivos")}, ensure_ascii=False, indent=1))

assert not tc["semDados"] and len(tc["rainfallSeries"]) == 13 and len(tc["riverSeries"]) == 13
assert 40 < tc["rainfall24h"] < 60, tc["rainfall24h"]          # media das 2 estacoes com dados
assert tc["temperature"] == 20.5 and tc["humidity"] == 80      # so a estacao que mede
assert tc["fonte"] == "CEMADEN + ANA" and tc["riverLevel"] is not None
assert tc["level"] in ("atencao", "critico")                   # chuva >= 50 mm/24h pelo limiar provisorio
assert all(m["semDados"] for m in muns if m["id"] != "tres-coroas")
assert col.alertas_automaticos(muns)[0]["id"].startswith("auto-tres-coroas")
print("OK - pipeline simulado funcionando")
