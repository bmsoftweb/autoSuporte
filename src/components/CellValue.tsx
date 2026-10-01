import React from 'react';
import { FieldDef, RegistroCrud } from '../types';

/** Valor da célula como texto, conforme o tipo do campo */
function formatar(field: FieldDef, value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (field.type) {
    case 'number':
      return new Intl.NumberFormat('pt-BR').format(Number(value));
    case 'password':
      return '••••••••';
    case 'datetime': {
      // Vem do MySQL como "aaaa-mm-dd hh:mm:ss" já no horário de Brasília: só reordena, sem fuso
      const [d, h = ''] = String(value).replace('T', ' ').split(' ');
      const [a, m, dia] = d.split('-');
      return a && m && dia ? `${dia}/${m}/${a} ${h.slice(0, 5)}`.trim() : String(value);
    }
    default: {
      const text = String(value);
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
  }
}

/** Célula da grade (modelo do crmWeb): selos para enumerações e Sim/Não */
export const CellValue: React.FC<{ field: FieldDef; row: RegistroCrud }> = ({ field, row }) => {
  const value = row[field.name];

  // Chave estrangeira: o nome que a lista já traz do servidor
  if (field.ref) {
    const rotulo = row[`${field.name}__rotulo`];
    return value == null || value === '' ? <span className="text-stone-400">—</span> : <span className="truncate">{rotulo ?? <span className="italic text-stone-400">Excluído (#{value})</span>}</span>;
  }

  if (field.type === 'enum' && value) {
    const label = field.options?.find((o) => o.value === String(value))?.label || String(value);
    return (
      <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700">
        {label}
      </span>
    );
  }

  if (field.type === 'boolean') {
    const on = value === true || Number(value) === 1;
    return (
      <span
        className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          on
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
            : 'bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700'
        }`}
      >
        {on ? 'Sim' : 'Não'}
      </span>
    );
  }

  return <span className={field.type === 'number' ? 'font-mono' : undefined}>{formatar(field, value)}</span>;
};
