import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** Valores oferecidos; dá para escolher um ou digitar outro */
  opcoes: string[];
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  className: string;
}

/** Campo de texto com lista digitável logo abaixo (filtra pelo que foi digitado; setas, Enter e Esc) */
export const ComboDigitavel: React.FC<Props> = ({ id, value, onChange, opcoes, maxLength, placeholder, required, className }) => {
  const [aberta, setAberta] = useState(false);
  const [marcado, setMarcado] = useState(-1);
  const termo = value.trim().toLowerCase();
  // Igual ao que está digitado não precisa aparecer; o resto filtra pelo trecho
  const lista = opcoes.filter((o) => o.toLowerCase() !== termo && (!termo || o.toLowerCase().includes(termo)));
  const visivel = aberta && lista.length > 0;

  const escolher = (o: string) => {
    onChange(o);
    setAberta(false);
    setMarcado(-1);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAberta(true);
          setMarcado(-1);
        }}
        onFocus={(e) => {
          e.target.select();
          setAberta(true);
        }}
        onBlur={() => setAberta(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAberta(true);
            setMarcado((m) => Math.min(m + 1, lista.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMarcado((m) => Math.max(m - 1, 0));
          } else if (e.key === 'Enter' && visivel && marcado >= 0) {
            e.preventDefault();
            escolher(lista[marcado]);
          } else if (e.key === 'Escape' && visivel) {
            e.stopPropagation();
            setAberta(false);
          }
        }}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={visivel}
        aria-controls={`${id}-lista`}
        className={`${className} pr-8`}
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
      {visivel && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg py-1"
        >
          {lista.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={i === marcado}
              // mousedown (antes do blur do campo) para a escolha não se perder
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
              onMouseEnter={() => setMarcado(i)}
              className={`px-3 py-1.5 text-xs cursor-pointer ${
                i === marcado ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'text-stone-700 dark:text-stone-200'
              }`}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
