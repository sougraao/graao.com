# Launchpad — guia de configuração por subconta

Implementado localmente em 18/11/2026. Sem deploy ou alteração de dados em produção.

## Referência e evidências

Alvo solicitado: `https://app.gohighlevel.com/v2/location/hIQz6VW7TraTdbyxtBae/launchpad`.

Observação na sessão autenticada do navegador interno, por Computer Use:

- Cinco categorias: Configuração inicial; Marketing e geração de leads; Vendas e conversas; Website e monetização; Comércio eletrônico.
- Lista de tarefas expansíveis, percentual por tarefa e barra de progresso da categoria.
- A primeira tarefa pendente aparece aberta. O tutorial abre em modal com um player de vídeo; foi aberto e fechado sem cadastrar ou conectar recursos na conta de referência.
- A categoria muda dentro da mesma página. A sessão examinada estava com progresso zerado.

O MCP REA não encontrou um endpoint CDP em `127.0.0.1:9222`. A interface conectada permitiu inventariar os recursos carregados via `Page.getResourceTree`. Os módulos públicos identificados foram baixados para `.data/rea-launchpad/` e analisados como texto inerte pelo MCP REA.

Evidência principal: `ev_d7f4e530e24bda27b40caeba82c079bf6cc9c5e5d4b32c93b4da13234ac2e0f2`.

- Seleção: `16e4e5544d624b24.js`, `ceb881961517c7b7.js`, `b3d1dd4bbbd45fc7.js`.
- 3 arquivos analisados, 215.729 bytes lidos, 17 módulos recuperados, zero erros de parsing. O inventário completo contém 17 arquivos; 14 não foram selecionados para análise.
- SHA-256 do inventário: `48ea5e87d414ed8ce3e8e9e0d1359bc185a5890dc96200a081d934ccd95cb274`.
- Bundle de evidências exportado para `.data/rea-launchpad-evidence.json` (ignorado pelo Git).

A leitura dos módulos selecionados encontrou `launchpad-main`, `product-list`, a barra ligada a `getCategoryCompletionPercentage`, produtos por categoria, estados `COMPLETED`/`PENDING`, seleção de tarefa e modal de tutorial/PiP. O auxiliar `selectDefaultOpenCard` em `b3d1dd4bbbd45fc7.js` seleciona produto e tutorial. Essas são observações estáticas corroborando o layout observado; não estabelecem execução de todos os caminhos.

Limites: o grafo REA é parcial, com dependências externas e relações dinâmicas não resolvidas. O trace literal de `launchpad.progressTitle` não teve correspondência no grafo indexado; isso não demonstra ausência da string, presente na leitura direta do módulo. Não foram observadas chamadas de conclusão de tarefas no backend do HighLevel. A abertura inicial após criar uma conta no HighLevel é requisito fornecido pelo usuário, não um cadastro realizado nesta inspeção.

## Comportamento na Graao

- `#launchpad` é a entrada padrão ao abrir ou trocar uma subconta. Links explícitos para módulos e a entrada sem hash da agência conservam seus destinos.
- `#launchpad/initial`, `/marketing`, `/sales`, `/website` e `/commerce` permitem acessar categorias diretamente.
- São 17 tarefas, com 28 etapas verificáveis, para contatos, importação, funil, formulário, WhatsApp, campanha, automação, agendamento, oportunidade, redes sociais, chat, site, blog, produto, loja, curso, link de pagamento e fatura. Algumas tarefas aparecem em mais de uma categoria; o total geral conta cada tarefa uma vez.
- As tarefas e categorias respeitam os módulos efetivamente liberados. Uma tarefa com dois módulos exige ambos. Nenhum novo privilégio é concedido pelo Launchpad.
- O progresso usa registros salvos da subconta atual. Abrir uma tela ou tutorial não conclui etapas. Publicação, ativação, importação com contatos adicionados e conexão real do WhatsApp são verificados separadamente de rascunhos.
- Percentuais são a proporção de etapas concluídas; o contador mostra tarefas inteiramente concluídas. A conclusão pode regredir se um recurso for removido ou desativado. Não há um histórico de conquistas independente do estado operacional.
- A primeira tarefa pendente é expandida. Os links abrem a ferramenta correspondente e mostram um caminho de volta ao guia. A troca de workspace grava também seu identificador na URL para preservar a conta correta ao recarregar.
- Tutoriais próprios em texto, dentro de modal acessível com fechamento por Escape. Nenhum vídeo ou código proprietário do HighLevel é incorporado na aplicação.
- Recursos sem equivalente operacional, como anúncios de leads, migração WordPress e conexão Stripe, não são apresentados como tarefas executáveis. As instruções de campanha distinguem planejamento do envio pelo provedor.

## Arquivos e persistência

`ui/launchpad-data.js` define as etapas e o cálculo; `ui/launchpad.js` renderiza o guia e os tutoriais; `ui/launchpad.css` usa os tokens de tema existentes. Integração em `ui/screens.js`, `ui/app.js`, `ui/index.html` e na lista de estáticos de `server.mjs`. Espelhos sincronizados em `public/`.

O progresso é derivado dos documentos já persistidos. Não requer migration, nova tabela, token de integração ou gravação paralela de conclusão. O estado lido pela interface continua passando pela projeção de permissões e pelo bloqueio de contas suspensas existentes.

## Verificação

- `test/launchpad.test.mjs`: conta vazia a 0%; rascunhos versus publicação; importação de contatos versus oportunidades; conexão WhatsApp; filtragem por módulo; guia sem tarefas; persistência após nova leitura; isolamento entre duas subcontas; entrega dos três assets com MIME correto.
- Navegador com SQLite em memória: criação de workspace vazio abriu o Launchpad; tutorial abriu; seu link levou a Contatos; cadastro de contato foi salvo pela API; retorno marcou a tarefa em 100%, categoria em 9% e progresso geral em 4%; recarregar preservou o resultado. Categorias e temas claro/escuro conferidos visualmente.
- 118 testes aprovados em lotes cobrindo todos os 26 arquivos de teste. A execução monolítica no sandbox foi interrompida por limite de memória do Node; o último lote de WAHA, webinars/QR e WhatsApp passou fora desse limite. Não houve falha de asserção.
- `node --check`, verificação de whitespace e comparação dos arquivos espelhados.

Limite da validação: não houve conexão a provedores reais, homologação com banco de produção ou teste em dispositivo móvel físico.
