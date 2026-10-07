import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

import { criarAgente } from '../server/agente.ts';
import { PROMPT_PADRAO as PROMPT } from '../server/prompt.ts';

/**
 * Roda uma única vez: cria o ambiente e o agente na Anthropic e mostra os IDs para o .env.
 * Instruções: Configurações › Agente de IA; modelo e esforço: no cadastro de cada usuário. Usuário com chave própria ganha agente e ambiente na conta dele (prepararContaUsuario em server/agente.ts).
 */
const client = new Anthropic();

const { agent_id, environment_id } = await criarAgente(client, PROMPT);

console.log(`ENVIRONMENT_ID=${environment_id}`);
console.log(`AGENT_ID=${agent_id}`);
