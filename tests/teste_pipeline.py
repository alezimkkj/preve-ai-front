"""Teste offline do pipeline com respostas SIMULADAS (sem internet).  python tests/teste_pipeline.py"""
import json
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import clientes as c
import coletar as col

agora = datetime(2026, 10, 7, 14, 20, tzinfo=c.UTC)
cfg = json.loads(col.CONFIG.read_text(encoding="utf-8"))
col.HISTORICO = Path(tempfile.mkdtemp()) / "hist.json"


def cem(cod, inicio_min, fim_min, mm=0.4):
    """Formato REAL da PED: 1 registro por sensor (id_sensor 10 = chuva), UTC, ultimos minutos."""
    return [{"codestacao": cod, "datahora": (agora - timedelta(minutes=m)).strftime("%Y-%m-%d %H:%M:%S"),
             "id_sensor": "10", "valor": "-999" if m == 20 else str(mm), "uf": "RS"}
            for m in range(inicio_min, fim_min, 10)]


# 1) uma chamada real traz so ~1 h
r1 = c.normalizar_cemaden(cem("432170903A", 0, 60))
assert len(r1) == 5 and all(r["chuva"] == 0.4 for r in r1), r1   # sentinela -999 descartada

# 2) historico acumulado por 26 h (execucoes a cada 30 min)
hist = {}
for k in range(26 * 2, -1, -1):
    agora_k = agora - timedelta(minutes=30 * k)
    col.acumular_historico({
        "432170903A": [dict(x, t=x["t"] - timedelta(minutes=30 * k)) for x in r1],
        "432170902A": [dict(x, t=x["t"] - timedelta(minutes=30 * k)) for x in c.normalizar_cemaden(cem("432170902A", 0, 60, 0.3))],
        "432170901A": [],
    }, agora_k)
cem_cache = col.acumular_historico({}, agora)

ana_items = []
for i in range(7 * 24 * 4):
    t_local = (agora - timedelta(minutes=15 * i)).astimezone(c.BRT)
    ana_items.append({"codigoestacao": "87366500", "Data_Hora_Medicao": t_local.strftime("%Y-%m-%d %H:%M:%S.0"),
                      "Cota_Adotada": "%.2f" % (6900 + 5 * (-(15 * i) / 60) * -1), "Chuva_Adotada": "0.10"})
ana_cache = {"87366500": c.normalizar_ana({"items": ana_items})}

muns = col.montar(cfg, cem_cache, ana_cache, agora)
tc = next(m for m in muns if m["id"] == "tres-coroas")
print(json.dumps({k: tc[k] for k in ("level", "rainfall24h", "riverLevel", "riverRelativo", "temperature", "fonte", "motivos")}, ensure_ascii=False))
assert not tc["semDados"] and len(tc["rainfallSeries"]) == 13 and len(tc["riverSeries"]) == 13
assert tc["fonte"].startswith("CEMADEN") and 20 < tc["rainfall24h"] < 70, tc["rainfall24h"]
assert tc["riverRelativo"] and 0 <= tc["riverLevel"] < 15
assert tc["temperature"] is None            # a PED so entrega pluviometro nestas estacoes

# 3) sem historico suficiente, a chuva vem da ANA
curto = col.montar(cfg, {"432170903A": r1}, ana_cache, agora)
assert next(m for m in curto if m["id"] == "tres-coroas")["fonte"].startswith("ANA")
assert all(m["semDados"] for m in muns if m["id"] in ("taquara", "gramado"))
print("OK - pipeline simulado funcionando")
