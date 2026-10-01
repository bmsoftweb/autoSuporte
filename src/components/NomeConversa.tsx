import React, { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { INPUT_CLASS } from '../utils/formStyles';
import { ConfirmDialog } from './ConfirmDialog';

interface NomeConversaProps {
  /** Nome dado à conversa; null = sem nome */
  titulo: string | null;
  /** O que aparece sem nome (a primeira pergunta) */
  padrao: string;
  /** Grava o nome (em branco volta ao padrão); erro lançado aparece no title do campo */
  onSalvar: (titulo: string) => Promise<void>;
  className?: string;
}

/** Nome da conversa com lápis para renomear no lugar: Enter salva, Esc cancela */
export const NomeConversa: React.FC<NomeConversaProps> = ({ titulo, padrao, onSalvar, className = '' }) => {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const abrir = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTexto(titulo ?? '');
    setErro('');
    setEditando(true);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar(texto.trim());
      setEditando(false);
    } catch (err: any) {
      setErro(err.message || 'Não foi possível salvar o nome.');
    } finally {
      setSalvando(false);
    }
  };

  if (editando) {
    return (
      // Clique dentro do editor não abre a conversa (a linha da lista é clicável)
      <span className={`flex items-center gap-1 min-w-0 ${className}`} onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={texto}
          maxLength={120}
          placeholder={padrao || 'Nome da conversa'}
          title={erro || 'Enter salva; Esc cancela. Em branco volta a mostrar a primeira pergunta'}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              salvar();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditando(false);
            }
          }}
          className={`${INPUT_CLASS} flex-1 min-w-0 py-1 ${erro ? 'text-rose-600' : ''}`}
        />
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          title="Salvar o nome"
          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer disabled:opacity-50 shrink-0"
        >
          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          disabled={salvando}
          title="Cancelar"
          className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className={`group/nome flex items-center gap-1.5 min-w-0 ${className}`}>
      <span className={`truncate ${titulo ? '' : 'text-stone-500 dark:text-stone-400'}`}>{titulo || padrao}</span>
      <button
        type="button"
        onClick={abrir}
        title="Dar um nome a esta conversa"
        className="p-0.5 rounded text-stone-300 hover:text-blue-600 group-hover/nome:text-stone-400 dark:text-stone-600 dark:hover:text-blue-400 cursor-pointer shrink-0"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </span>
  );
};

/** Diálogo para renomear uma conversa (coluna Ações da grade de Minhas conversas) */
export const RenomearConversa: React.FC<{
  titulo: string;
  onSalvar: (titulo: string) => Promise<void>;
  onFechar: () => void;
}> = ({ titulo, onSalvar, onFechar }) => {
  const [texto, setTexto] = useState(titulo);
  return (
    <ConfirmDialog
      titulo="Nome da conversa"
      mensagem="Em branco volta a mostrar a primeira pergunta."
      confirmar="Salvar nome"
      tom="normal"
      onConfirmar={async () => {
        await onSalvar(texto.trim());
        onFechar();
      }}
      onCancelar={onFechar}
    >
      <input
        autoFocus
        value={texto}
        maxLength={120}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={(e) => e.target.select()}
        className={`${INPUT_CLASS} w-full`}
      />
    </ConfirmDialog>
  );
};
