import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

import { PROMPT_PADRAO as PROMPT } from '../server/prompt.ts';

/**
 * Roda uma única vez: cria o ambiente e o agente na Anthropic e mostra os IDs para o .env.
 * Modelo, esforço e instruções mudam depois em Configurações › Agente de IA (as conversas novas pegam a versão nova).
 */
const client = new Anthropic();

const env = await client.beta.environments.create({
  name: 'autosuporte',
  // Sem saída para a internet: o agente só lê o repositório montado
  config: { type: 'cloud', networking: { type: 'limited' } },
});

const agent = await client.beta.agents.create({
  name: 'Suporte ao cliente',
  model: 'claude-opus-5-5',
  system: PROMPT,
  // Só leitura: sem bash, escrita, edição nem internet
  tools: [
    {
      type: 'agent_toolset_20260401',
      default_config: { enabled: false },
      configs: [
        { name: 'read', enabled: true },
        { name: 'glob', enabled: true },
        { name: 'grep', enabled: true },
      ],
    },
  ],
});

console.log(`ENVIRONMENT_ID=${env.id}`);
console.log(`AGENT_ID=${agent.id}`);
