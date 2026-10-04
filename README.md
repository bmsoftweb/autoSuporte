# autoSuporte

O cliente final entra, escolhe o sistema, digita a dúvida (e, se quiser, cola ou anexa um print da tela) e recebe a resposta.

Cada conversa abre uma sessão de um agente hospedado pela Anthropic (Managed Agents). Nessa sessão, o repositório do sistema é clonado em `/workspace/sistema`. O agente só tem leitura (`read`, `glob`, `grep`): não roda comandos, não altera arquivos e não acessa a internet. O token do GitHub não entra no contêiner.

## Configuração

1. `npm install`
2. Copie `.env.example` para `.env` e preencha MySQL, `SESSION_SECRET`, `ANTHROPIC_API_KEY` e `GITHUB_TOKEN`.
3. `npm run criar-agente` (uma única vez) e copie `ENVIRONMENT_ID` e `AGENT_ID` para o `.env` e para as variáveis da Vercel.
4. Crie as tabelas (estrutura sugerida abaixo).
5. `npm run dev` para rodar em http://localhost:3000.

## Tabelas

```sql
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  senha_hash VARCHAR(100) NOT NULL,   -- bcrypt
  tipo VARCHAR(20) NOT NULL DEFAULT 'cliente',  -- 'admin' mantém os cadastros; 'cliente' só tira dúvidas; 'tecnico' tira dúvidas com resposta técnica
  config_listas TEXT NULL,            -- preferências das listas (colunas, larguras...) em JSON
  ativo TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE sistemas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  grupo VARCHAR(60) NULL,             -- grupo no menu lateral (ex.: Fiscal); vazio = sem grupo
  repo_url VARCHAR(255) NOT NULL,     -- https://github.com/dono/repo
  branch VARCHAR(100) NULL,           -- vazio = branch padrão do repositório
  mapa TEXT NULL,                     -- mapa do sistema (botão "Montar mapa")
  github_token VARCHAR(500) NULL      -- token de outra conta do GitHub, cifrado; vazio = GITHUB_TOKEN
);

-- Sistemas que cada cliente contratou
CREATE TABLE usuario_sistemas (
  usuario_id INT NOT NULL,
  sistema_id INT NOT NULL,
  PRIMARY KEY (usuario_id, sistema_id)
);

-- Histórico: também garante que uma conversa só continua com o próprio dono
CREATE TABLE perguntas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  sistema_id INT NOT NULL,
  sessao_id VARCHAR(80) NOT NULL,
  pergunta TEXT NOT NULL,
  com_imagem TINYINT(1) NOT NULL DEFAULT 0,
  resposta MEDIUMTEXT NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (sessao_id)
);

-- Sistemas relacionados: repositórios abertos junto nas conversas do sistema (ex.: NFe -> módulo de transmissão)
CREATE TABLE sistema_relacionados (
  sistema_id INT NOT NULL,
  relacionado_id INT NOT NULL,
  PRIMARY KEY (sistema_id, relacionado_id)
);

-- Nome e visibilidade de cada conversa (sem linha aqui: sem nome e privada)
CREATE TABLE conversas (
  sessao_id VARCHAR(80) NOT NULL PRIMARY KEY,
  usuario_id INT NOT NULL,
  titulo VARCHAR(120) NULL,                                       -- vazio = a primeira pergunta
  visibilidade ENUM('privado','publico') NOT NULL DEFAULT 'privado', -- pública: poderá ser liberada aos usuários finais
  resposta_faq MEDIUMTEXT NULL                                      -- botão "Compactar": a resposta; a pergunta fica em titulo
);
```

Para gerar o hash da senha de um cliente:

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'senha-do-cliente'
```

## Custos

Cada conversa tem um teto de gasto (`ORCAMENTO_CENTAVOS`, padrão US$ 1,00). Ao atingir o teto, o cliente é orientado a abrir uma nova conversa. O gasto de cada sessão aparece no console da Anthropic.
