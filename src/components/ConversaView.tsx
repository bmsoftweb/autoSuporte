import React, { useEffect, useRef, useState } from 'react';
import { Bot, ImageIcon, Loader2, X } from 'lucide-react';
import { fetchConversa, MensagemConversa } from '../api';
import { RegistroCrud } from '../types';
import { AvisoErro } from './AvisoErro';

/** "aaaa-mm-dd hh:mm:ss" (já em horário de Brasília) -> "dd/mm/aaaa hh:mm" */
const dataHora = (v: string) => {
  const [d, h = ''] = String(v).replace('T', ' ').split(' ');
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a} ${h.slice(0, 5)}`;
};

/** Conversa inteira de um cliente (todas as perguntas da mesma sessão), só leitura, aberta na aba da lista Conversas */
export const ConversaView: React.FC<{ record: RegistroCrud; onFechar: () => void }> = ({ record, onFechar }) => {
  const [mensagens, setMensagens] = useState<MensagemConversa[] | null>(null);
  const [erro, setErro] = useState('');
  const destaqueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    fetchConversa(String(record.sessao_id))
      .then((l) => vivo && setMensagens(l))
      .catch((err) => vivo && setErro(err.message || 'Não foi possível carregar a conversa.'));
    return () => {
      vivo = false;
    };
  }, [record.sessao_id]);

  // Leva até a pergunta que foi aberta na lista
  useEffect(() => {
    destaqueRef.current?.scrollIntoView({ block: 'center' });
  }, [mensagens]);

  const primeira = mensagens?.[0];

  return (
    <>
      <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 lg:px-8 py-5 bg-stone-100/70 dark:bg-stone-950">
        {erro && <AvisoErro mensagem={erro} onFechar={() => setErro('')} className="mb-3" />}
        {!mensagens && !erro && (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-stone-500 dark:text-stone-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando a conversa…
          </div>
        )}
        <div className="flex flex-col gap-3">
          {mensagens?.map((m) => {
            const destaque = Number(m.id) === Number(record.id);
            return (
              <React.Fragment key={m.id}>
                <div ref={destaque ? destaqueRef : undefined} className="flex flex-col items-end gap-1">
                  <span className="text-[10px] text-stone-400">{dataHora(m.criado_em)}</span>
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-relaxed shadow-xs whitespace-pre-wrap bg-blue-600 text-white ${
                      destaque ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-stone-100 dark:ring-offset-stone-950' : ''
                    }`}
                  >
                    {Boolean(Number(m.com_imagem)) && (
                      <span
                        title="O print fica só na sessão do agente (console da Anthropic), não no banco"
                        className="flex items-center gap-1.5 mb-1 text-[11px] text-blue-100"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Enviou um print da tela
                      </span>
                    )}
                    {m.pergunta || <span className="italic text-blue-100">(só o print)</span>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-relaxed shadow-xs whitespace-pre-wrap bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100">
                    {m.resposta || <span className="italic text-stone-400">(sem resposta gravada)</span>}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Barra fixa ao pé, como a do formulário */}
      <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2.5 bg-stone-50 dark:bg-stone-950/40 shrink-0">
        <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
          {primeira
            ? `${primeira.titulo ? `“${primeira.titulo}” • ` : ''}${primeira.cliente ?? 'Cliente excluído'} • ${primeira.sistema ?? 'Sistema excluído'} • ${mensagens!.length} pergunta(s) • sessão ${record.sessao_id}`
            : `Sessão ${record.sessao_id}`}
        </span>
        <button
          type="button"
          onClick={onFechar}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          <span>Fechar</span>
        </button>
      </div>
    </>
  );
};
