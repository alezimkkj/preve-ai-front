"""Clientes das APIs da ANA (Hidroweb) e do CEMADEN + normalizacao dos dados.

Nenhuma credencial fica no codigo: tudo vem de variaveis de ambiente
(no GitHub Actions, de 'Secrets'). Nada aqui imprime tokens ou senhas.
"""
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import requests

CEMADEN_BASE = "https://sws.cemaden.gov.br/PED/rest"
ANA_BASE = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas"
TIMEOUT = 30
BRT = timezone(timedelta(hours=-3))
UTC = timezone.utc


# ---------------------------------------------------------------- utilidades
def sem_acento(s):
    s = unicodedata.normalize("NFD", str(s))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip()


def para_float(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    if s in ("", "-", "null", "None", "NaN"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


_FORMATOS = ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f",
             "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M")


def parse_data(valor, fuso):
    """Converte texto de data em datetime com fuso (UTC). `fuso` e o fuso do texto."""
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        seg = valor / 1000 if valor > 1e11 else valor
        return datetime.fromtimestamp(seg, UTC)
    s = str(valor).strip()
    if s.endswith("Z"):
        s = s[:-1]
        fuso = UTC
    if "T" in s and re.search(r"[+-]\d\d:?\d\d$", s):  # ISO com deslocamento explicito
        try:
            return datetime.fromisoformat(s).astimezone(UTC)
        except ValueError:
            pass
    for f in _FORMATOS:
        try:
            return datetime.strptime(s, f).replace(tzinfo=fuso).astimezone(UTC)
        except ValueError:
            continue
    return None


def _minusculas(d):
    return {str(k).lower(): v for k, v in d.items()}


def _extrair_lista(payload):
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for k in ("dados", "data", "items", "registros", "estacoes", "result", "results"):
            v = payload.get(k)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
        for v in payload.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []


def _primeiro(d, chaves):
    for k in chaves:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


# ------------------------------------------------------------------- CEMADEN
<<<<<<< HEAD
INFO = {"token": "nenhum"}


def _expira_em_h(token):
    """Horas ate o JWT expirar (le so o claim 'exp'); None se nao der para ler."""
    try:
        import base64
        import json
        import time
        corpo = token.split(".")[1]
        corpo += "=" * (-len(corpo) % 4)
        exp = json.loads(base64.urlsafe_b64decode(corpo)).get("exp")
        return None if exp is None else (exp - time.time()) / 3600
    except Exception:  # noqa: BLE001
        return None


=======
>>>>>>> ffd93cb3eda549470682f9c759784792ba6ff296
def cemaden_token():
    """Token do CEMADEN. O token dura poucas horas, entao o ideal e gerar um novo
    a cada execucao com e-mail/senha (secrets CEMADEN_EMAIL e CEMADEN_SENHA).
    CEMADEN_TOKEN (fixo) so funciona enquanto nao expirar."""
    email, senha = os.environ.get("CEMADEN_EMAIL"), os.environ.get("CEMADEN_SENHA")
    erros = []
    if email and senha:
        tentativas = [
<<<<<<< HEAD
            ("POST", "https://sgaa.cemaden.gov.br/SGAA/rest/controle-token/tokens", {"json": {"email": email, "password": senha}}),
            ("POST", "https://sgaa.cemaden.gov.br/SGAA/rest/controle-token/tokens", {"json": {"login": email, "password": senha}}),
            ("GET", f"{CEMADEN_BASE}/token", {"headers": {"email": email, "password": senha}}),
            ("POST", f"{CEMADEN_BASE}/token", {"json": {"email": email, "password": senha}}),
        ]
        for metodo, url, kw in tentativas:
            rotulo = f"{metodo} {url.split('//')[1].split('/')[0]}/..{url.rsplit('/', 1)[-1]}"
            try:
                r = requests.request(metodo, url, timeout=TIMEOUT, **kw)
                if r.status_code != 200:
                    erros.append(f"{rotulo} -> HTTP {r.status_code}")
                    continue
                try:
                    j = r.json()
                    tok = (j.get("token") or j.get("access_token")) if isinstance(j, dict) else None
                except ValueError:
                    tok = None
                tok = tok or r.text.strip().strip('"')
                if tok and len(tok) > 40 and " " not in tok:
                    INFO["token"] = "e-mail/senha (token novo a cada execucao)"
                    return tok
                erros.append(f"{rotulo} -> HTTP 200 sem token reconhecivel")
            except requests.RequestException as e:
                erros.append(f"{rotulo} -> {type(e).__name__}")
    fixo = os.environ.get("CEMADEN_TOKEN")
    if fixo:
        h = _expira_em_h(fixo)
        INFO["token"] = ("CEMADEN_TOKEN fixo" + ("" if h is None else (f" (expira em {h:.1f} h)" if h > 0 else " (JA EXPIRADO)"))
                         + " - login por e-mail/senha nao funcionou: " + ("; ".join(erros) or "sem secrets de e-mail/senha"))
=======
            ("GET", {"headers": {"email": email, "password": senha}}),
            ("POST", {"json": {"email": email, "password": senha}}),
        ]
        for metodo, kw in tentativas:
            try:
                r = requests.request(metodo, f"{CEMADEN_BASE}/token", timeout=TIMEOUT, **kw)
                if r.status_code != 200:
                    erros.append(f"{metodo} /token -> HTTP {r.status_code}")
                    continue
                try:
                    j = r.json()
                    tok = j.get("token") if isinstance(j, dict) else None
                except ValueError:
                    tok = None
                tok = tok or r.text.strip().strip('"')
                if tok and len(tok) > 20:
                    return tok
                erros.append(f"{metodo} /token -> resposta sem token")
            except requests.RequestException as e:
                erros.append(f"{metodo} /token -> {type(e).__name__}")
    fixo = os.environ.get("CEMADEN_TOKEN")
    if fixo:
>>>>>>> ffd93cb3eda549470682f9c759784792ba6ff296
        return fixo
    raise RuntimeError("Sem token CEMADEN. Defina CEMADEN_EMAIL + CEMADEN_SENHA (ou CEMADEN_TOKEN). "
                       + "; ".join(erros))


def cemaden_dados_recentes(token, codestacao, rede="11", uf="RS"):
    r = requests.get(f"{CEMADEN_BASE}/pcds/pcds-dados-recentes", headers={"token": token},
                     params={"codestacao": codestacao, "rede": rede, "uf": uf, "formato": "JSON"},
                     timeout=TIMEOUT)
    r.raise_for_status()
    try:
        return r.json()
    except ValueError:
        return []


def cemaden_cadastro(token, uf="RS", rede="11"):
    """Tenta listar o cadastro de PCDs. Devolve (lista, aviso)."""
    ult = ""
    for caminho in ("pcds-cadastro/estacoes", "pcds/pcds-cadastro", "pcds-cadastro"):
        try:
            r = requests.get(f"{CEMADEN_BASE}/{caminho}", headers={"token": token},
                             params={"uf": uf, "rede": rede, "formato": "JSON"}, timeout=TIMEOUT)
            if r.status_code == 200:
                lista = _extrair_lista(r.json())
                if lista:
                    return lista, f"cadastro via /{caminho}"
            ult = f"/{caminho} -> HTTP {r.status_code}"
        except (requests.RequestException, ValueError) as e:
            ult = f"/{caminho} -> {type(e).__name__}"
    return [], f"cadastro indisponivel ({ult})"


def normalizar_cemaden(payload, fuso=UTC):
    """-> lista de {t (UTC), chuva (mm), temp (C), umid (%)}; aceita formato largo ou longo."""
    out = []
    for r in _extrair_lista(payload):
        r = _minusculas(r)
        t = parse_data(_primeiro(r, ["datahora", "data_hora", "datahora_leitura", "dt_medicao", "data"]), fuso)
        if t is None:
            continue
        reg = {"t": t, "chuva": None, "temp": None, "umid": None}
<<<<<<< HEAD
        if "id_sensor" in r and "valor" in r and "sensor" not in r:
            # Formato real da PED: um registro por sensor; id_sensor 10 = pluviometro (mm por leitura)
            if str(r["id_sensor"]).strip() == "10":
                reg["chuva"] = para_float(r["valor"])
        elif "sensor" in r and "valor" in r:
=======
        if "sensor" in r and "valor" in r:
>>>>>>> ffd93cb3eda549470682f9c759784792ba6ff296
            s, v = sem_acento(r["sensor"]), para_float(r["valor"])
            if any(x in s for x in ("chuva", "precip", "pluv")):
                reg["chuva"] = v
            elif "temp" in s:
                reg["temp"] = v
            elif "umid" in s:
                reg["umid"] = v
        else:
            reg["chuva"] = para_float(_primeiro(r, ["chuva", "precipitacao", "valor_chuva", "pluviometro"]))
            reg["temp"] = para_float(_primeiro(r, ["temperatura", "temp"]))
            reg["umid"] = para_float(_primeiro(r, ["umidade", "umid"]))
        # descarta sentinelas/valores absurdos
        if reg["chuva"] is not None and not (0 <= reg["chuva"] < 400):
            reg["chuva"] = None
        if reg["temp"] is not None and not (-20 <= reg["temp"] <= 55):
            reg["temp"] = None
        if reg["umid"] is not None and not (0 <= reg["umid"] <= 100):
            reg["umid"] = None
        if any(reg[k] is not None for k in ("chuva", "temp", "umid")):
            out.append(reg)
    return sorted(out, key=lambda x: x["t"])


# ----------------------------------------------------------------------- ANA
def ana_token():
    usuario, senha = os.environ.get("ANA_USUARIO"), os.environ.get("ANA_SENHA")
    if not usuario or not senha:
        raise RuntimeError("Defina ANA_USUARIO e ANA_SENHA.")
    r = requests.get(f"{ANA_BASE}/OAUth/v1", headers={"Identificador": usuario, "Senha": senha},
                     timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["items"]["tokenautenticacao"]


def ana_serie(token, codigo, intervalo="DIAS_7", data=None):
    data = data or datetime.now(BRT).strftime("%Y-%m-%d")
    r = requests.get(f"{ANA_BASE}/HidroinfoanaSerieTelemetricaAdotada/v2",
                     headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                     params={"Codigos_Estacoes": codigo, "Tipo Filtro Data": "DATA_LEITURA",
                             "Data de Busca (yyyy-MM-dd)": data, "Range Intervalo de busca": intervalo},
                     timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def normalizar_ana(payload, fuso=BRT, unidade="auto"):
    """-> lista de {t (UTC), nivel (m), chuva (mm)}."""
    itens = _extrair_lista(payload)
    bruto = []
    for it in itens:
        it = _minusculas(it)
        t = parse_data(_primeiro(it, ["data_hora_medicao", "datahora", "data_hora"]), fuso)
        if t is None:
            continue
        nivel = chuva = None
        for k, v in it.items():
<<<<<<< HEAD
            if (k.startswith("nivel") or k.startswith("cota")) and nivel is None:
=======
            if k.startswith("nivel") and nivel is None:
>>>>>>> ffd93cb3eda549470682f9c759784792ba6ff296
                nivel = para_float(v)
            elif k.startswith("chuva") and chuva is None:
                chuva = para_float(v)
        bruto.append({"t": t, "nivel": nivel, "chuva": chuva})
    niveis = [b["nivel"] for b in bruto if b["nivel"] is not None]
    em_cm = unidade == "cm" or (unidade == "auto" and niveis and max(niveis) > 25)
    for b in bruto:
        if b["nivel"] is not None and em_cm:
            b["nivel"] /= 100.0
        if b["chuva"] is not None and b["chuva"] < 0:
            b["chuva"] = None
    return sorted([b for b in bruto if b["nivel"] is not None or b["chuva"] is not None],
                  key=lambda x: x["t"])
