import React, { useEffect, useState } from 'react';
import { Loader2, Shrink, Sparkles } from 'lucide-react';
import { compactarConversa, salvarConversa } from '../api';
import { INPUT_CLASS } from '../utils/formStyles';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  sessao: string;
  /** Pergunta já compactada (o nome da conversa) e resposta compactada; sem resposta, a IA compacta ao abrir */
  titulo: string | null;
  respostaFaq: string | null;
  onSalvo: (r: { titulo: string | null; resposta_faq: string | null }) => void;
}

/** Botão "Compactar": a IA resume a conversa em uma pergunta e uma resposta (FAQ); revisa e salva */
export const CompactarConversa: React.FC<Props> = ({ sessao, titulo, respostaFaq, onSalvo }) => {
  const [aberto, setAberto] = useState(false);
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  const gerar = async () => {
    setGerando(true);
    setErro('');
    try {
      const r = await compactarConversa(sessao);
      setPergunta(r.pergunta);
      setResposta(r.resposta);
    } catch (err: any) {
      setErro(err.message || 'Não foi possível compactar a conversa.');
    } finally {
      setGerando(false);
    }
  };

  // Ao abrir: mostra a compactação salva; sem ela, já pede à IA
  useEffect(() => {
    if (!aberto) return;
    setErro('');
    if (respostaFaq) {
      setPergunta(titulo ?? '');
      setResposta(respostaFaq);
    } else {
      setPergunta('');
      setResposta('');
      gerar();
    }
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={respostaFaq ? 'Ver ou refazer a conversa compactada (pergunta e resposta)' : 'Resumir a conversa em uma pergunta e uma resposta, como num FAQ'}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shrink-0 ${
          respostaFaq
            ? 'text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            : 'text-stone-600 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
        }`}
      >
        <Shrink className="w-3.5 h-3.5" />
        {respostaFaq ? 'Compactada' : 'Compactar'}
      </button>

      {aberto && (
        <ConfirmDialog
          larga
          titulo="Conversa compactada"
          mensagem="Uma pergunta e uma resposta, como num FAQ. Revise antes de salvar; a pergunta vira o nome da conversa."
          confirmar="Salvar"
          tom="normal"
          onConfirmar={async () => {
            if (gerando) throw new Error('Espere a IA terminar.');
            if (!pergunta.trim() || !resposta.trim()) throw new Error('Preencha a pergunta e a resposta.');
            const r = await salvarConversa(sessao, { titulo: pergunta.trim(), resposta_faq: resposta.trim() });
            onSalvo({ titulo: r.titulo, resposta_faq: r.resposta_faq });
            setAberto(false);
          }}
          onCancelar={() => setAberto(false)}
        >
          {gerando ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-stone-500 dark:text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Compactando a conversa…
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-stone-300">
                Pergunta
                <input
                  value={pergunta}
                  maxLength={120}
                  onChange={(e) => setPergunta(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className={`${INPUT_CLASS} w-full font-normal`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-stone-300">
                Resposta
                <textarea
                  value={resposta}
                  rows={12}
                  onChange={(e) => setResposta(e.target.value)}
                  className={`${INPUT_CLASS} w-full font-normal resize-y`}
                />
              </label>
              {erro && <span className="text-xs text-rose-600">{erro}</span>}
              <button
                type="button"
                onClick={gerar}
                className="flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Refazer com a IA
              </button>
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
};
