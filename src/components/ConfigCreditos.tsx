import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { fetchConfig, salvarConfig } from '../api';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { AvisoErro } from './AvisoErro';
import { DateField } from './DateField';
import { NumberField } from './NumberField';

interface Creditos {
  saldo: number;
  data: string;
  alerta: number;
}

/** Avisado ao salvar: o saldo do menu lateral recarrega na hora */
export const EVENTO_CREDITOS = 'autosuporte:creditos';

/** Data de hoje no horário local (Brasília), "aaaa-mm-dd" */
function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Configurações › Créditos: saldo visto no Console, a data e o valor de alerta do menu */
export const ConfigCreditos: React.FC<{ onToast: (msg: string) => void }> = ({ onToast }) => {
  const [v, setV] = useState<Creditos | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<Creditos | null>('creditos', 'saldo')
      .then(({ valor }) => setV(valor ?? { saldo: 0, data: hoje(), alerta: 5 }))
      .catch((e) => setErro(e.message));
  }, []);

  if (!v) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = (m: Partial<Creditos>) => {
    setV({ ...v, ...m });
    setErro(null);
  };
  const campo = `${INPUT_CLASS} w-full`;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvarConfig('creditos', 'saldo', v);
      window.dispatchEvent(new Event(EVENTO_CREDITOS));
      onToast('Saldo gravado. O menu já mostra o saldo estimado.');
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
        A Anthropic não informa o saldo pela API. Informe o saldo que aparece no Console (menu Créditos) e a data em que você o viu. O menu
        mostra esse valor menos o custo das conversas e mapas do autoSuporte desde então, a preço de tabela, atualizado a cada 5 minutos. Uso
        fora do app (ex.: Playground) não entra. Ao comprar créditos, atualize o saldo e a data.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={FIELD_CLASS}>
          <label htmlFor="cr-saldo" className={LABEL_CLASS}>
            Saldo no Console (US$)
          </label>
          <NumberField id="cr-saldo" value={v.saldo.toFixed(2)} onChange={(t) => alterar({ saldo: Number(t) || 0 })} scale={2} required className={campo} />
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="cr-data" className={LABEL_CLASS}>
            Visto em
          </label>
          <DateField id="cr-data" value={v.data} onChange={(data) => alterar({ data })} required className={campo} />
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="cr-alerta" className={LABEL_CLASS}>
            Avisar abaixo de (US$)
          </label>
          <NumberField id="cr-alerta" value={v.alerta.toFixed(2)} onChange={(t) => alterar({ alerta: Number(t) || 0 })} scale={2} className={campo} />
          <span className={HINT_CLASS}>O saldo fica em vermelho no menu. 0 = sem aviso</span>
        </div>
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
    </form>
  );
};
