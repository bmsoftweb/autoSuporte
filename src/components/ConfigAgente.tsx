import React, { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { fetchConfig, salvarConfig } from '../api';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { AvisoErro } from './AvisoErro';
import { ConfirmDialog } from './ConfirmDialog';
import { NumberField } from './NumberField';

interface Agente {
  modelo: string;
  esforco: string;
  /** Dólares, ex.: 1 = US$ 1,00 */
  orcamento: number;
  instrucoes: string;
}
type Opcao = { value: string; label: string };

/** Configurações › Agente de IA: modelo, esforço, teto por conversa, mapa do projeto e instruções */
export const ConfigAgente: React.FC<{ onToast: (msg: string) => void }> = ({ onToast }) => {
  const [v, setV] = useState<Agente | null>(null);
  const [modelos, setModelos] = useState<Opcao[]>([]);
  const [esforcos, setEsforcos] = useState<Opcao[]>([]);
  const [promptPadrao, setPromptPadrao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [restaurar, setRestaurar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<Agente>('agente', 'ia')
      .then((r) => {
        setV(r.valor);
        setModelos(r.modelos);
        setEsforcos(r.esforcos);
        setPromptPadrao(r.prompt_padrao);
      })
      .catch((e) => setErro(e.message));
  }, []);

  if (!v) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = (m: Partial<Agente>) => {
    setV({ ...v, ...m });
    setErro(null);
  };
  const campo = `${INPUT_CLASS} w-full`;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvarConfig('agente', 'ia', v);
      onToast('Configuração do agente gravada. As conversas novas já usam os novos valores.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={salvar} className="max-w-3xl flex flex-col gap-4">
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}

      <p className="text-xs text-stone-600 dark:text-stone-300">
        Vale para as conversas novas. As que já estão abertas continuam com a configuração com que começaram. Para comparar o custo, veja cada
        conversa em console.anthropic.com › Sessions.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={FIELD_CLASS}>
          <label htmlFor="ag-modelo" className={LABEL_CLASS}>
            Modelo
          </label>
          <select id="ag-modelo" value={v.modelo} onChange={(e) => alterar({ modelo: e.target.value })} required className={`${campo} cursor-pointer`}>
            {modelos.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className={HINT_CLASS}>O Sonnet costuma dar conta de achar a tela e explicar, pela metade do preço</span>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="ag-esforco" className={LABEL_CLASS}>
            Esforço
          </label>
          <select id="ag-esforco" value={v.esforco} onChange={(e) => alterar({ esforco: e.target.value })} required className={`${campo} cursor-pointer`}>
            {esforcos.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className={HINT_CLASS}>Quanto o agente pensa e investiga a cada pergunta</span>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="ag-orcamento" className={LABEL_CLASS}>
            Teto por conversa (US$)
          </label>
          <NumberField
            id="ag-orcamento"
            value={v.orcamento.toFixed(2)}
            onChange={(t) => alterar({ orcamento: Number(t) || 0 })}
            scale={2}
            required
            className={campo}
          />
          <span className={HINT_CLASS}>Ao atingir, o agente para e o cliente precisa abrir uma conversa nova (entre 0,10 e 50,00)</span>
        </div>
      </div>

      <p className={HINT_CLASS}>
        Para o agente abrir menos arquivos, preencha o <b>Mapa do sistema</b> no cadastro de cada sistema (Cadastros › Sistemas).
      </p>

      <div className={FIELD_CLASS}>
        <div className="flex items-center gap-2">
          <label htmlFor="ag-instrucoes" className={LABEL_CLASS}>
            Instruções do agente
          </label>
          {v.instrucoes.trim() !== promptPadrao.trim() && (
            <button
              type="button"
              onClick={() => setRestaurar(true)}
              title="Voltar às instruções que vêm com o app"
              className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restaurar padrão
            </button>
          )}
        </div>
        <textarea
          id="ag-instrucoes"
          value={v.instrucoes}
          onChange={(e) => alterar({ instrucoes: e.target.value })}
          rows={16}
          required
          className={`${campo} resize-y font-mono text-[12px] leading-relaxed`}
        />
        <span className={HINT_CLASS}>
          Como o agente investiga e responde. Mantenha a regra de nunca mostrar código ao cliente.
        </span>
      </div>

      <div>
        <button
          type="submit"
          disabled={salvando}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar configuração
        </button>
      </div>

      {restaurar && (
        <ConfirmDialog
          titulo="Restaurar as instruções padrão?"
          mensagem="O texto que você escreveu nas instruções é substituído pelo padrão do app. Só vale depois de salvar."
          confirmar="Restaurar"
          onConfirmar={() => {
            alterar({ instrucoes: promptPadrao });
            setRestaurar(false);
          }}
          onCancelar={() => setRestaurar(false)}
        />
      )}
    </form>
  );
};
