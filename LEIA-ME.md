# PrevêAÍ — painel com dados reais (ANA + CEMADEN)

O site é estático (GitHub Pages). Um workflow do GitHub Actions roda a cada 30 min, consulta as APIs com
credenciais guardadas em **Secrets**, gera `assets/js/data.js` e publica só a pasta do site.
Credenciais nunca ficam no código nem no site publicado.

## Passo a passo
1. **Enviar ao GitHub** (o projeto já vem ligado ao seu repositório `alezimkkj/preve-ai-front`):
   ```bash
   git add .
   git status          # confira: nada de senha, token ou .env
   git commit -m "Dados reais da ANA e do CEMADEN via GitHub Actions"
   git push origin main
   ```
   O repositório precisa ser **público** para usar Pages no plano grátis.
2. **Secrets**: repositório → Settings → Secrets and variables → Actions → New repository secret:
   `ANA_USUARIO`, `ANA_SENHA`, `CEMADEN_EMAIL`, `CEMADEN_SENHA` (opcional: `CEMADEN_TOKEN`).
3. **Pages**: Settings → Pages → Source: **GitHub Actions**.
4. **Descobrir estações**: aba Actions → "Descobrir estacoes" → Run workflow. Ao terminar, abra o resumo
   do job: lista as estações que retornaram dados e um bloco JSON para colar em `config/estacoes.json`.
5. Edite `config/estacoes.json`, faça commit/push. O workflow "Atualizar dados e publicar site" roda
   sozinho (também a cada 30 min ou via Run workflow). O endereço aparece em Settings → Pages.

## Como o painel é calculado
- Chuva 24 h: soma por estação CEMADEN nas últimas 24 h; estações do mesmo município são mescladas pela média
  (só entram as que têm leitura no intervalo). Reserva: chuva da ANA.
- Nível do rio e variação (padrão 6 h): estação ANA com a leitura mais recente.
- Temperatura/umidade: última leitura (até 3 h) das estações CEMADEN, média.
- Risco: limiares em `config/estacoes.json` (**provisórios** — calibre com a Defesa Civil).
- Sem leitura recente → o município aparece como "Sem dados"; nenhum valor é estimado.

## Teste local
`python tests/teste_pipeline.py` (dados simulados, sem internet).
Com credenciais: exporte as variáveis (`export ANA_USUARIO=...`) e rode `python scripts/coletar.py`.
