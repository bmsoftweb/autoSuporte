import React, { useState } from 'react';
import { ConfigAgente } from './ConfigAgente';
import { ConfigCreditos } from './ConfigCreditos';

/**
 * Configurações do app, no formato do crmWeb: uma aba por grupo de configuração.
 * Cada aba grava na tabela `config` (grupo + chave). Só administradores chegam aqui.
 */
const ABAS = [
  {
    id: 'agente',
    titulo: 'Agente de IA',
    descricao: 'Modelo, esforço, teto de gasto por conversa e instruções do agente que responde aos clientes.',
  },
  {
    id: 'creditos',
    titulo: 'Créditos',
    descricao: 'Saldo de créditos da Anthropic mostrado no menu (estimado a partir do saldo informado e do gasto desde então).',
  },
];

export const ConfiguracoesView: React.FC<{ onToast: (msg: string) => void }> = ({ onToast }) => {
  const [aba, setAba] = useState(ABAS[0].id);
  const atual = ABAS.find((a) => a.id === aba) || ABAS[0];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-stone-900">
      {/* Abas dos grupos de configuração */}
      <div className="bg-stone-50 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 flex overflow-x-auto shrink-0">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-3 text-xs font-bold shrink-0 border-b-2 transition-all cursor-pointer ${
              aba === a.id
                ? 'border-blue-600 text-blue-600 bg-white dark:bg-stone-900 dark:text-blue-400'
                : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-200'
            }`}
          >
            {a.titulo}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-4">
          <div className="mb-3">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">{atual.titulo}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{atual.descricao}</p>
          </div>

          {aba === 'agente' && <ConfigAgente onToast={onToast} />}
          {aba === 'creditos' && <ConfigCreditos onToast={onToast} />}
        </div>
      </div>
    </div>
  );
};
