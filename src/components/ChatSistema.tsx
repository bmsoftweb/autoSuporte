import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, ImagePlus, Loader2, MessagesSquare, SendHorizontal, X } from 'lucide-react';
import { chamar, fetchMinhaConversa, mudarVisibilidade, renomearConversa, Sistema, Visibilidade } from '../api';
import { INPUT_CLASS } from '../utils/formStyles';
import { CompactarConversa } from './CompactarConversa';
import { ConfirmDialog } from './ConfirmDialog';
import { NomeConversa, VisibilidadeConversa } from './NomeConversa';

interface Mensagem {
  autor: 'cliente' | 'suporte';
  texto: string;
  imagem?: string; // data URL, só para mostrar na tela
}
interface Imagem {
  tipo: 'image/jpeg';
  base64: string;
  url: string;
}

/** Reduz o print (máx. 1920 px) e converte para JPEG: cabe no limite da Vercel e gasta menos tokens */
function prepararImagem(arquivo: File): Promise<Imagem> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 1920 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', 0.9);
      URL.revokeObjectURL(img.src);
      ok({ tipo: 'image/jpeg', base64: url.split(',')[1], url });
    };
    img.onerror = () => falha(new Error('Não foi possível ler a imagem.'));
    img.src = URL.createObjectURL(arquivo);
  });
}

interface ChatSistemaProps {
  sistema: Sistema;
  /** Fica montado escondido quando outro sistema é aberto: a conversa continua ali ao voltar */
  visivel: boolean;
  /** Muda a cada clique em "Nova conversa" no cabeçalho */
  novaToken: number;
  /** Conversa antiga escolhida em "Minhas conversas": carrega o histórico e continua na mesma sessão */
  carregar?: { sessao: string; seq: number } | null;
}

/** Janela de chat de um sistema: pergunta (com print opcional) e resposta do agente em streaming */
export const ChatSistema: React.FC<ChatSistemaProps> = ({ sistema, visivel, novaToken, carregar }) => {
  const [sessaoId, setSessaoId] = useState('');
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [imagem, setImagem] = useState<Imagem | null>(null);
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const perguntaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  useEffect(() => {
    if (visivel) perguntaRef.current?.focus();
  }, [visivel]);

  // Nova conversa (o primeiro valor é o da abertura, não limpa nada)
  const primeiraNova = useRef(novaToken);
  useEffect(() => {
    if (novaToken === primeiraNova.current) return;
    setSessaoId('');
    setMensagens([]);
    setTitulo(null);
    setVisibilidade('privado');
    setRespostaFaq(null);
    setErro('');
    perguntaRef.current?.focus();
  }, [novaToken]);

  /** Nome da conversa aberta (null = mostra a primeira pergunta) */
  const [titulo, setTitulo] = useState<string | null>(null);
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('privado');
  /** Resposta compactada (FAQ); a pergunta compactada é o titulo */
  const [respostaFaq, setRespostaFaq] = useState<string | null>(null);

  // Reabre uma conversa antiga: as próximas perguntas vão para a mesma sessão do agente
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    if (!carregar) return;
    let vivo = true;
    setCarregando(true);
    setErro('');
    fetchMinhaConversa(carregar.sessao)
      .then(({ titulo, visibilidade, resposta_faq, mensagens: lista }) => {
        if (!vivo) return;
        setSessaoId(carregar.sessao);
        setTitulo(titulo);
        setVisibilidade(visibilidade);
        setRespostaFaq(resposta_faq);
        setMensagens(
          lista.flatMap((m): Mensagem[] => [
            // O print não fica guardado: só o aviso de que foi enviado
            { autor: 'cliente', texto: (Number(m.com_imagem) ? '(print da tela enviado)\n' : '') + (m.pergunta || '') },
            { autor: 'suporte', texto: m.resposta || '' },
          ]),
        );
      })
      .catch((err) => vivo && setErro(err.message || 'Não foi possível abrir a conversa.'))
      .finally(() => {
        if (!vivo) return;
        setCarregando(false);
        perguntaRef.current?.focus();
      });
    return () => {
      vivo = false;
    };
  }, [carregar?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  async function anexar(arquivo: File | undefined | null) {
    if (!arquivo || !arquivo.type.startsWith('image/')) return;
    try {
      setImagem(await prepararImagem(arquivo));
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function enviar() {
    if (aguardando || (!pergunta.trim() && !imagem)) return;
    setErro('');
    setAguardando(true);
    const enviada = { pergunta: pergunta.trim(), imagem };
    setMensagens((m) => [...m, { autor: 'cliente', texto: enviada.pergunta, imagem: imagem?.url }, { autor: 'suporte', texto: '' }]);
    setPergunta('');
    setImagem(null);

    const escrever = (t: string) =>
      setMensagens((m) => {
        const copia = [...m];
        copia[copia.length - 1] = { ...copia[copia.length - 1], texto: copia[copia.length - 1].texto + t };
        return copia;
      });

    try {
      const r = await chamar('POST', '/api/perguntar', {
        sistemaId: sistema.id,
        sessaoId: sessaoId || undefined,
        pergunta: enviada.pergunta,
        imagem: enviada.imagem ? { tipo: enviada.imagem.tipo, base64: enviada.imagem.base64 } : undefined,
      });
      setSessaoId(r.headers.get('X-Sessao') || '');
      const leitor = r.body!.getReader();
      const decodificador = new TextDecoder();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        escrever(decodificador.decode(value, { stream: true }));
      }
    } catch (err: any) {
      // Tira a bolha de resposta vazia e devolve a pergunta para o campo
      setMensagens((m) => (m[m.length - 1]?.texto ? m : m.slice(0, -2)));
      setPergunta(enviada.pergunta);
      setImagem(enviada.imagem);
      setErro(err.message);
    } finally {
      setAguardando(false);
      perguntaRef.current?.focus();
    }
  }

  return (
    <main className={`flex-1 flex-col min-h-0 w-full ${visivel ? 'flex' : 'hidden'}`}>
      {/* Nome da conversa: aparece quando ela já existe (depois da primeira resposta ou ao reabrir) */}
      {sessaoId && (
        <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-2 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center gap-2 text-xs">
          <span className="text-stone-400 shrink-0">Conversa:</span>
          <NomeConversa
            titulo={titulo}
            padrao={mensagens.find((m) => m.autor === 'cliente')?.texto.replace('(print da tela enviado)\n', '') || '(só o print da tela)'}
            onSalvar={async (novo) => setTitulo(await renomearConversa(sessaoId, novo))}
            className="flex-1 font-semibold text-stone-700 dark:text-stone-200"
          />
          <VisibilidadeConversa
            visibilidade={visibilidade}
            onSalvar={async (v) => setVisibilidade(await mudarVisibilidade(sessaoId, v))}
          />
          <CompactarConversa
            sessao={sessaoId}
            titulo={titulo}
            respostaFaq={respostaFaq}
            onSalvo={(r) => {
              setTitulo(r.titulo);
              setRespostaFaq(r.resposta_faq);
            }}
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col gap-3">
          {carregando && (
            <div className="mt-16 flex items-center justify-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Abrindo a conversa…
            </div>
          )}
          {!mensagens.length && !carregando && (
            <div className="mt-16 flex flex-col items-center text-center gap-3 text-stone-500 dark:text-stone-400">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-center">
                <MessagesSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">Como podemos ajudar com o {sistema.nome}?</p>
              <p className="text-xs max-w-sm">Digite sua dúvida. Se quiser, cole (Ctrl+V) ou anexe um print da tela.</p>
            </div>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={`flex ${m.autor === 'cliente' ? 'justify-end' : 'items-start gap-2'}`}>
              {m.autor === 'suporte' && (
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-xs whitespace-pre-wrap ${
                  m.autor === 'cliente'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-bl-md'
                }`}
              >
                {m.imagem && <img src={m.imagem} alt="Print enviado" className="mb-2 max-h-64 rounded-lg" />}
                {m.texto ||
                  (aguardando && i === mensagens.length - 1 && (
                    <span className="flex items-center gap-2 text-stone-500 dark:text-stone-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analisando o sistema… pode levar alguns minutos.
                    </span>
                  ))}
              </div>
            </div>
          ))}
          <div ref={fimRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col gap-2">
          {erro && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{erro}</span>
            </div>
          )}
          {imagem && (
            <div className="relative w-fit">
              <img src={imagem.url} alt="Print anexado" className="h-16 rounded-lg border border-stone-200 dark:border-stone-700" />
              <button
                type="button"
                onClick={() => setConfirmarRemocao(true)}
                title="Remover o print"
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={arquivoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                anexar(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              disabled={aguardando}
              title="Anexar um print da tela (também dá para colar com Ctrl+V)"
              className="flex items-center justify-center px-3 rounded-lg text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <textarea
              ref={perguntaRef}
              required={!imagem}
              rows={2}
              maxLength={4000}
              value={pergunta}
              placeholder="Qual é a sua dúvida?"
              title="Enter envia; Shift+Enter quebra a linha"
              onChange={(e) => setPergunta(e.target.value)}
              onPaste={(e) => {
                const item = [...e.clipboardData.items].find((it) => it.type.startsWith('image/'));
                if (item) {
                  e.preventDefault();
                  anexar(item.getAsFile());
                }
              }}
              onKeyDown={(e) => {
                // Enter envia; Shift+Enter quebra a linha
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              className={`${INPUT_CLASS} flex-1 resize-none text-[13px]`}
            />
            <button
              type="button"
              onClick={enviar}
              disabled={aguardando}
              title="Enviar a dúvida"
              className="flex items-center justify-center gap-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default shrink-0"
            >
              {aguardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
              <span className="hidden sm:inline">{aguardando ? 'Aguarde...' : 'Enviar'}</span>
            </button>
          </div>
        </div>
      </div>

      {confirmarRemocao && (
        <ConfirmDialog
          titulo="Remover o print?"
          mensagem="O print anexado sai desta pergunta. Você pode anexar outro depois."
          confirmar="Remover"
          onConfirmar={() => {
            setImagem(null);
            setConfirmarRemocao(false);
          }}
          onCancelar={() => setConfirmarRemocao(false)}
        />
      )}
    </main>
  );
};
