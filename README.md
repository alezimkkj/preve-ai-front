# PrevêAÍ

Protótipo frontend de pesquisa acadêmica sobre monitoramento hidrometeorológico e alerta antecipado de inundações em Três Coroas/RS, na bacia do Rio Paranhana.

## Descrição

O PrevêAÍ é a interface do protótipo da camada de monitoramento e comunicação de alertas de um projeto de pesquisa maior, que investiga a influência de diferentes variáveis hidrometeorológicas (precipitação, nível do rio, temperatura, umidade) e horizontes de previsão sobre modelos computacionais de previsão de inundações.

**Importante:** o modelo preditivo (rede neural) da pesquisa ainda está em desenvolvimento e **não está integrado** a este frontend. Todos os valores de monitoramento exibidos são dados demonstrativos, claramente sinalizados na interface.

## Funcionalidades

**Lado público**
- Apresentação do projeto (Início, Projeto, Como funciona)
- Painel de monitoramento com busca de município, condição atual, métricas, gráficos e mapa regional demonstrativo
- Listagem de alertas recentes com filtros por município e nível
- Alternância entre tema claro e escuro, com persistência

**Lado administrativo**
- Login simulado (qualquer usuário/senha não vazios)
- Painel administrativo com indicadores resumidos
- Criação, edição e exclusão de alertas, com persistência em `localStorage`
- Filtros por status e nível de alerta

## Tecnologias

**Utilizadas neste frontend:** HTML, CSS e JavaScript puro (sem build), ícones SVG inline, gráficos em SVG, CSS moderno com variáveis (design tokens) e `localStorage`/`sessionStorage`.

**Previstas para o projeto de pesquisa (não implementadas neste frontend):** Python, Pandas, NumPy, TensorFlow/Keras, SQLite, APIs de dados hidrometeorológicos, integração com WhatsApp via Evolution API.

## Estrutura de pastas

```
index.html      página única (roteamento por hash: #/, #/projeto, #/monitoramento ...)
css/            tokens de design e folhas de estilo
js/icons.js     ícones SVG
js/data.js      dados mock de municípios e alertas semente
js/app.js       roteador, páginas, gráficos, alertas, login simulado
```