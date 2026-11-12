Sistema de monitoramento hidrometeorológico desenvolvido como parte do projeto de pesquisa PrevêAÍ, com foco no acompanhamento das condições meteorológicas e do nível do Rio Paranhana, em Três Coroas/RS, e na comunicação de informações que auxiliem a população na prevenção de riscos de inundação.

Links

Aplicação publicada (GitHub Pages): https://alezimkkj.github.io/preve-ai-front/

Repositório (GitHub): https://github.com/alezimkkj/preve-ai-front

Sobre o projeto

O PrevêAÍ é uma aplicação web que apresenta informações hidrometeorológicas de forma organizada e acessível. O site permite acompanhar dados de precipitação, condições meteorológicas e nível do Rio Paranhana, além de visualizar gráficos que facilitam a compreensão das variações do rio.

A aplicação foi desenvolvida para complementar o projeto de pesquisa, servindo como uma ferramenta de apresentação e comunicação dos dados e dos possíveis alertas à população.
Funcionalidades implementadas

- Apresentação de informações meteorológicas e hidrológicas.
- Visualização do nível e da variação do Rio Paranhana por meio de gráficos.
- Apresentação dos níveis de alerta e de suas respectivas orientações.
- Organização das informações para facilitar a navegação e a compreensão dos usuários.
- Atualização automatizada dos dados por meio de um workflow do GitHub Actions.
- Interface adaptável a diferentes tamanhos de tela.
  Tecnologias utilizadas
- HTML: estruturação e organização semântica das páginas.
- CSS: estilização, layouts e responsividade da interface.
- JavaScript: implementação da interatividade e manipulação dinâmica dos elementos da página.
- localStorage e sessionStorage: armazenamento de informações no navegador.
- Git e GitHub: controle de versão e hospedagem do código-fonte.
- GitHub Pages: publicação da aplicação web.
- GitHub Actions: automação do processo de atualização dos dados e publicação do site.

Atualização automatizada

Foi desenvolvido um workflow utilizando GitHub Actions para automatizar a atualização dos dados utilizados pela aplicação. O processo executa a obtenção e o processamento das informações, atualiza os arquivos utilizados pelo site e realiza o envio das alterações ao GitHub Pages, mantendo a aplicação atualizada sem a necessidade de executar manualmente cada etapa.

Critérios de avaliação

A aplicação atende aos cinco critérios estabelecidos para o desenvolvimento do projeto:

1. Deploy e Funcionamento: a aplicação está publicada no GitHub Pages e pode ser acessada diretamente pelo navegador.
2. Interatividade sem Recarregamento: as interações com os elementos da interface são realizadas por JavaScript, permitindo atualizar informações e executar ações sem recarregar desnecessariamente a página.
3. Persistência de Dados: são utilizados recursos de armazenamento do navegador, como localStorage e sessionStorage, para manter informações conforme a necessidade de cada funcionalidade.
4. Estabilidade do Console: a aplicação foi testada no navegador e não apresenta erros no console durante seu funcionamento.
5. Adaptabilidade e Responsividade: o layout se adapta a diferentes tamanhos de tela, incluindo dispositivos móveis. Também são utilizadas estruturas HTML adequadas e descrições alternativas em imagens para favorecer a acessibilidade.
   Desenvolvimento futuro

A integração com o WhatsApp está prevista como uma etapa futura do projeto. O objetivo é permitir que os usuários recebam notificações e alertas diretamente pelo aplicativo, ampliando o alcance das informações e fortalecendo a comunicação preventiva com a população.
