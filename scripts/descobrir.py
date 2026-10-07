"""Procura estacoes ANA e CEMADEN que RETORNAM DADOS nos municipios do Vale do Paranhana.

Roda pelo workflow 'Descobrir estacoes' (ou localmente com as variaveis de ambiente).
Gera relatorio/descoberta.md e relatorio/descoberta.json. Nao imprime credenciais.
"""
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
import clientes as c  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CONFIG = json.loads((RAIZ / "config" / "estacoes.json").read_text(encoding="utf-8"))
ALVOS = [m["nome"] for m in CONFIG["municipios"]] + ["Parobé", "Rolante", "Riozinho"]
ALVOS = list(dict.fromkeys(ALVOS))
IBGE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/43/municipios"
SEQ_MAX = 20  # sondagem de codigos <ibge><NN>A


def ibge_codigos():
    r = requests.get(IBGE_URL, timeout=30)
    r.raise_for_status()
    mapa = {c.sem_acento(m["nome"]): str(m["id"]) for m in r.json()}
    return {nome: mapa.get(c.sem_acento(nome)) for nome in ALVOS}


def amostra(d):
    if isinstance(d, list) and d:
        d = d[0]
    return {str(k): str(v)[:60] for k, v in list(d.items())[:14]} if isinstance(d, dict) else {}


def tem_registros(payload):
    return bool(c._extrair_lista(payload))


def cemaden(token, ibge):
    achados, sondados = [], 0
    # 1) cadastro oficial (se a API expuser)
    cadastro, aviso = c.cemaden_cadastro(token)
    cand = {}
    for e in cadastro:
        e2 = c._minusculas(e)
        txt = c.sem_acento(" ".join(str(v) for v in e2.values()))
        for nome in ALVOS:
            if c.sem_acento(nome) in txt:
                cod = c._primeiro(e2, ["codestacao", "cod_estacao", "codigo", "id"])
                if cod:
                    cand[str(cod)] = {"municipio": nome, "nome": str(c._primeiro(e2, ["nome", "nomeestacao", "local"]) or "")}
    # 2) sondagem por codigo: <IBGE 7 digitos><01..20>A
    for nome, cod_ibge in ibge.items():
        if not cod_ibge:
            continue
        for i in range(1, SEQ_MAX + 1):
            cod = f"{cod_ibge}{i:02d}A"
            cand.setdefault(cod, {"municipio": nome, "nome": "(sondagem por codigo)"})
    for cod, info in cand.items():
        sondados += 1
        try:
            p = c.cemaden_dados_recentes(token, cod)
            regs = c.normalizar_cemaden(p)
            bruto = c._extrair_lista(p)
            if bruto:
                ult = max((r["t"] for r in regs), default=None)
                achados.append({"codigo": cod, **info, "registros": len(bruto), "registros_validos": len(regs),
                                "ultima_leitura_utc": ult.isoformat() if ult else None,
                                "sensores": sorted({k for k in ("chuva", "temp", "umid") if any(r[k] is not None for r in regs)}),
                                "amostra_bruta": amostra(p)})
        except requests.RequestException:
            pass
        time.sleep(0.15)
    return achados, aviso, sondados


def ana(token, ibge):
    achados, avisos = [], []
    cand = {}
    for cod in {x for m in CONFIG["municipios"] for x in m["ana"]}:
        cand[cod] = {"municipio": "(ja configurada)", "nome": ""}
    # inventario de estacoes (se a API aceitar os filtros)
    for params in ({"Unidade Federativa": "RS"}, {"Código da Unidade Federativa": "RS"}):
        try:
            r = requests.get("https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroInventarioEstacoes/v1",
                             headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                             params=params, timeout=60)
            if r.status_code == 200:
                for e in c._extrair_lista(r.json()):
                    e2 = c._minusculas(e)
                    txt = c.sem_acento(" ".join(str(v) for v in e2.values()))
                    for nome in ALVOS:
                        if c.sem_acento(nome) in txt:
                            cod = c._primeiro(e2, ["codigoestacao", "codigo_estacao", "codigo"])
                            if cod:
                                cand[str(cod)] = {"municipio": nome, "nome": str(c._primeiro(e2, ["nome_estacao", "nomeestacao", "nome"]) or "")}
                avisos.append(f"inventario consultado com {list(params)[0]}: {len(cand)} candidatas")
                break
            avisos.append(f"inventario {list(params)[0]} -> HTTP {r.status_code}")
        except (requests.RequestException, ValueError) as e:
            avisos.append(f"inventario -> {type(e).__name__}")
    for cod, info in cand.items():
        try:
            p = c.ana_serie(token, cod)
            regs = c.normalizar_ana(p)
            if regs:
                achados.append({"codigo": cod, **info, "registros": len(regs),
                                "primeira_utc": regs[0]["t"].isoformat(), "ultima_utc": regs[-1]["t"].isoformat(),
                                "tem_nivel": any(r["nivel"] is not None for r in regs),
                                "tem_chuva": any(r["chuva"] is not None for r in regs),
                                "amostra_bruta": amostra(c._extrair_lista(p))})
        except requests.RequestException:
            pass
        time.sleep(0.15)
    return achados, avisos


def main():
    rel = {"gerado_em": datetime.now(c.BRT).isoformat(), "cemaden": {}, "ana": {}}
    try:
        ibge = ibge_codigos()
    except requests.RequestException:
        ibge = {}
    rel["ibge"] = ibge
    try:
        tok = c.cemaden_token()
        ach, aviso, n = cemaden(tok, ibge)
        rel["cemaden"] = {"aviso": aviso, "codigos_sondados": n, "estacoes_com_dados": ach}
    except Exception as e:  # noqa: BLE001
        rel["cemaden"] = {"erro": str(e)}
    try:
        tok = c.ana_token()
        ach, avisos = ana(tok, ibge)
        rel["ana"] = {"avisos": avisos, "estacoes_com_dados": ach}
    except Exception as e:  # noqa: BLE001
        rel["ana"] = {"erro": type(e).__name__ + ": " + str(e)[:150]}

    md = [f"# Descoberta de estacoes — {rel['gerado_em']}", ""]
    md.append("## CEMADEN")
    if "erro" in rel["cemaden"]:
        md.append(f"Erro: {rel['cemaden']['erro']}")
    else:
        md.append(f"{rel['cemaden']['aviso']}; {rel['cemaden']['codigos_sondados']} codigos testados.\n")
        md.append("| Codigo | Municipio | Registros | Ultima leitura (UTC) | Sensores |\n|---|---|---|---|---|")
        for e in rel["cemaden"]["estacoes_com_dados"]:
            md.append(f"| {e['codigo']} | {e['municipio']} | {e['registros']} | {e['ultima_leitura_utc']} | {', '.join(e['sensores']) or '—'} |")
    md += ["", "## ANA"]
    if "erro" in rel["ana"]:
        md.append(f"Erro: {rel['ana']['erro']}")
    else:
        md.append("; ".join(rel["ana"]["avisos"]) + "\n")
        md.append("| Codigo | Municipio | Registros | Ultima (UTC) | Nivel | Chuva |\n|---|---|---|---|---|---|")
        for e in rel["ana"]["estacoes_com_dados"]:
            md.append(f"| {e['codigo']} | {e['municipio']} | {e['registros']} | {e['ultima_utc']} | {'sim' if e['tem_nivel'] else 'nao'} | {'sim' if e['tem_chuva'] else 'nao'} |")
    md += ["", "## Bloco para colar em config/estacoes.json", "```json"]
    sug = {}
    for e in rel["cemaden"].get("estacoes_com_dados", []):
        sug.setdefault(e["municipio"], {"cemaden": [], "ana": []})["cemaden"].append(e["codigo"])
    for e in rel["ana"].get("estacoes_com_dados", []):
        sug.setdefault(e["municipio"], {"cemaden": [], "ana": []})["ana"].append(e["codigo"])
    md += [json.dumps(sug, ensure_ascii=False, indent=2), "```", "",
           "## Amostra bruta (para conferir nomes de campos)"]
    for fonte in ("cemaden", "ana"):
        for e in rel[fonte].get("estacoes_com_dados", [])[:2]:
            md.append(f"- {fonte.upper()} {e['codigo']}: `{json.dumps(e['amostra_bruta'], ensure_ascii=False)}`")
    out = RAIZ / "relatorio"
    out.mkdir(exist_ok=True)
    (out / "descoberta.json").write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "descoberta.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
