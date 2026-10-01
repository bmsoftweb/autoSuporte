import React, { useEffect, useMemo, useState } from 'react';
import { Eraser, Search, SlidersHorizontal, X } from 'lucide-react';
import { fetchOptions, OpcaoRef } from '../api';
import { FieldDef, FiltroAvancado, ResourceDef } from '../types';
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { DateField } from './DateField';

interface AdvancedSearchProps {
  resource: ResourceDef;
  /** Filtros atualmente aplicados, para reidratar o painel ao reabrir */
  aplicados: FiltroAvancado[];
  /** fechar: veio do botão Aplicar (o painel fecha); Limpar mantém aberto para montar outro filtro */
  onAplicar: (filtros: FiltroAvancado[], fechar: boolean) => void;
  onFechar: () => void;
  /** Campos exibidos no painel (escolhidos no formulário de edição) */
  camposVisiveis: string[];
}

/** Sufixos usados nas chaves do formulário para os campos de faixa */
const MIN = '__min';
const MAX = '__max';

/** Campos de seleção: um combo com a opção "Todos" */
const isSelect = (f: FieldDef) => f.type === 'enum' || f.type === 'boolean' || Boolean(f.ref);

/** Data e hora vira faixa "de / até" (só a data) */
const isRange = (f: FieldDef) => f.type === 'datetime';

/** Converte os filtros aplicados de volta para os valores do formulário */
function paraFormulario(filtros: FiltroAvancado[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of filtros) {
    if (f.op === 'gte') out[`${f.field}${MIN}`] = f.value;
    else if (f.op === 'lte') out[`${f.field}${MAX}`] = f.value;
    else out[f.field] = f.value;
  }
  return out;
}

/**
 * Painel de busca avançada (modelo do crmWeb): texto, enumeração, Sim/Não, chave estrangeira e período.
 * ponytail: faixa numérica do crmWeb ficou de fora — trazer de lá quando surgir um campo assim.
 */
export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({ resource, aplicados, onAplicar, onFechar, camposVisiveis }) => {
  const campos = useMemo(() => resource.fields.filter((f) => camposVisiveis.includes(f.name)), [resource, camposVisiveis]);
  const [valores, setValores] = useState<Record<string, string>>(() => paraFormulario(aplicados));

  // Combos das chaves estrangeiras
  const [opcoes, setOpcoes] = useState<Record<string, OpcaoRef[]>>({});
  useEffect(() => {
    let vivo = true;
    for (const f of campos.filter((c) => c.ref && !opcoes[c.name])) {
      fetchOptions(f.ref!.resource)
        .then((lista) => vivo && setOpcoes((o) => ({ ...o, [f.name]: lista })))
        .catch(() => {});
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos]);

  const setValor = (chave: string, valor: string) => setValores((prev) => ({ ...prev, [chave]: valor }));

  /** Traduz o formulário para a lista de filtros enviada ao backend */
  const montarFiltros = (): FiltroAvancado[] =>
    campos.flatMap((f): FiltroAvancado[] => {
      if (isRange(f)) {
        const min = (valores[`${f.name}${MIN}`] || '').trim();
        const max = (valores[`${f.name}${MAX}`] || '').trim();
        return [
          ...(min ? [{ field: f.name, op: 'gte', value: min } as FiltroAvancado] : []),
          ...(max ? [{ field: f.name, op: 'lte', value: max } as FiltroAvancado] : []),
        ];
      }
      const v = (valores[f.name] || '').trim();
      // Texto busca por parte do conteúdo; seleções são igualdade exata
      return v ? [{ field: f.name, op: isSelect(f) ? 'eq' : 'contains', value: v }] : [];
    });

  const handleAplicar = (e: React.FormEvent) => {
    e.preventDefault();
    onAplicar(montarFiltros(), true);
  };

  const handleLimpar = () => {
    setValores({});
    onAplicar([], false);
  };

  const inputClass = `${INPUT_CLASS} w-full`;

  const renderCampo = (f: FieldDef) => {
    // Período: de / até
    if (isRange(f)) {
      return (
        <div className="flex items-center gap-1.5">
          <DateField value={valores[`${f.name}${MIN}`] || ''} onChange={(v) => setValor(`${f.name}${MIN}`, v)} className={inputClass} />
          <span className="text-stone-400 text-[11px] shrink-0">até</span>
          <DateField value={valores[`${f.name}${MAX}`] || ''} onChange={(v) => setValor(`${f.name}${MAX}`, v)} className={inputClass} />
        </div>
      );
    }

    // Chave estrangeira: combo com "Todos"
    if (f.ref) {
      return (
        <select value={valores[f.name] || ''} onChange={(e) => setValor(f.name, e.target.value)} className={`${inputClass} cursor-pointer`}>
          <option value="">Todos</option>
          {(opcoes[f.name] || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    // Booleano: Todos / Sim / Não
    if (f.type === 'boolean') {
      return (
        <select value={valores[f.name] || ''} onChange={(e) => setValor(f.name, e.target.value)} className={`${inputClass} cursor-pointer`}>
          <option value="">Todos</option>
          <option value="1">Somente {f.label.toLowerCase()} = Sim</option>
          <option value="0">Somente {f.label.toLowerCase()} = Não</option>
        </select>
      );
    }

    if (f.type === 'enum') {
      return (
        <select value={valores[f.name] || ''} onChange={(e) => setValor(f.name, e.target.value)} className={`${inputClass} cursor-pointer`}>
          <option value="">Todos</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    // Texto: busca por parte do conteúdo
    return (
      <input
        type="text"
        value={valores[f.name] || ''}
        onChange={(e) => setValor(f.name, e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder={`Parte de ${f.label.toLowerCase()}…`}
        className={inputClass}
      />
    );
  };

  return (
    <form onSubmit={handleAplicar} className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/50 shrink-0">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">Busca Avançada</span>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">Campos em branco são ignorados</span>
          </div>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar busca avançada"
            className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {campos.map((f) => (
            <div key={f.name} className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>{f.label}</label>
              {renderCampo(f)}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-3">
          <button
            type="button"
            onClick={handleLimpar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Limpar filtros</span>
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs transition-all cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Aplicar filtros</span>
          </button>
        </div>
      </div>
    </form>
  );
};
