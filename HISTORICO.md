# Histórico de versões

Mais recente primeiro. PATCH a cada envio ao GitHub; MAJOR/MINOR só quando pedido.

## 0.0.8 — 2026-10-01

- Mapa do Receita (mapas/Receita.txt), montado a partir da cópia local D:\bmsoft\Receita; mapa do Cadastros gravado no cadastro (repositório corrigido para bmsoftsistemas/Cadastros).

## 0.0.7 — 2026-10-01

- Sistemas: campo Grupo (coluna nova `sistemas.grupo`), com lista digitável dos grupos já usados; a lista de Sistemas mostra o Grupo antes do Nome e ordena por grupo + nome.
- Menu lateral: sistemas agrupados (Fiscal, Gestão, Utils, Vendas...), cada grupo recolhível; o navegador lembra os fechados.
- Listas: empate na ordenação desempata pelo nome do registro.
- Mapas montados para NFe, NFs, NFSe - PWS, PAF - NFCe, Pre - Venda, SPED, XML - Manager, BMOs, Compras, DAV, Master e NFCe - Nacional (mapas/); mapa do Cadastros pronto em mapas/Cadastros.txt; mapa do Notas em mapas/Notas.txt.

## 0.0.6 — 2026-10-01

- Ecossistema passa a se chamar Fluxograma (menu, título e aviso ao salvar).
- Fluxograma: componente Grupo, um quadrado com título para identificar áreas do quadro; redimensionável, e ao arrastá-lo os sistemas que estão dentro vão junto. Só visual, não muda as conversas.

## 0.0.5 — 2026-10-01

- Ecossistema: as ligações são desenhadas em ângulo reto e contornam os quadros (não passam por trás de nenhum).
- Cadastro de Sistemas: saiu a seção "Sistemas relacionados"; as ligações entre sistemas ficam só no Ecossistema.

## 0.0.4 — 2026-10-01

- Aviso quando o token do GitHub não lê o repositório (ou a branch não existe, ou o token expirou), antes de abrir a conversa ou montar o mapa, sem gastar créditos.
- Sistemas relacionados: os repositórios dos módulos ligados abrem junto em cada conversa nova, com o mapa de cada um; o agente diz em qual módulo fica a resposta. Tabela nova `sistema_relacionados`.
- Cadastros › Ecossistema: quadro gráfico único com os sistemas da empresa; arrastar para o quadro e ligar pelos 5 pontos de contato de cada card. A ligação é mútua (sem seta) e é a mesma do bloco "Sistemas relacionados" do cadastro.
- Chat: faixa com os módulos que a conversa consulta e os que ficaram de fora (com o motivo).

## 0.0.3 — 2026-10-01

- Sistemas: token do GitHub próprio por sistema (repositório de outra conta), gravado cifrado; em branco usa o GITHUB_TOKEN. Coluna nova `sistemas.github_token`.
- Conversas: visibilidade Privada (padrão) ou Pública, no chat e na tela Conversas; coluna Visibilidade nas listas e na busca avançada. Colunas novas `conversas.visibilidade` e `titulo` aceitando vazio.
- Botão "Compactar" no chat e na tela Conversas: a IA resume a conversa em uma pergunta e uma resposta (FAQ); revisa e salva (a pergunta vira o nome da conversa). Coluna nova `conversas.resposta_faq`.
- Listas: a linha clicada fica marcada (fundo azul e seta), como no crmWeb.
- Mapa do NFe montado (mapas/NFe.txt).

## 0.0.2 — 2026-10-01

- Primeira versão no GitHub.
- Chat por sistema: o cliente escolhe um dos sistemas liberados, digita a dúvida e pode colar ou anexar um print; um agente de IA (Anthropic Managed Agents) lê o repositório do sistema e responde em linguagem de usuário, sem mostrar código.
- Só a última mensagem do agente chega ao cliente (os comentários da investigação ficam de fora).
- Cadastros no padrão do crmWeb: Sistemas (com mapa e botão "Montar mapa"), Usuários (com sistemas liberados) e Conversas (só administrador).
- Minhas conversas: grade das conversas do cliente; reabrir e dar nome à conversa.
- Configurações: modelo, esforço, teto por conversa e instruções do agente; saldo de créditos.
- Saldo estimado de créditos no menu (só administrador), em vermelho abaixo do alerta.
