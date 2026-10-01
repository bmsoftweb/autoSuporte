import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, Eye, EyeOff, Loader2, Move, RotateCcw, Save, Scaling, Search, Wand2, X } from 'lucide-react';
import { chamar, fetchLigados, listRecords } from '../api';
import { FieldDef, RegistroCrud, ResourceDef } from '../types';
import type { TamanhoCampo } from '../utils/configListas';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { AvisoErro } from './AvisoErro';
import { ConfirmDialog } from './ConfirmDialog';
import { Toggle } from './Toggle';

interface RecordFormProps {
  resource: ResourceDef;
  /** Registro em edição; `null` indica inclusão */
  record: RegistroCrud | null;
  onCancel: () => void;
  onSave: (payload: RegistroCrud) => Promise<void>;
  /** Campos que hoje aparecem como coluna na lista */
  colunasVisiveis?: string[];
  /** Mostra/oculta o campo como coluna da lista */
  onAlternarColuna?: (campo: string) => void;
  /** Campos que hoje aparecem na busca avançada */
  camposBusca?: string[];
  /** Mostra/oculta o campo na busca avançada */
  onAlternarBusca?: (campo: string) => void;
  /** Ordem dos campos escolhida pelo usuário (arrastando pelo ícone de mover) */
  ordemCampos?: string[];
  onReordenarCampos?: (ordem: string[]) => void;
  /** Largura (colunas de 4) e altura escolhidas em "Customizar layout" */
  tamanhosCampos?: Record<string, TamanhoCampo>;
  onRedimensionarCampo?: (campo: string, tamanho: TamanhoCampo) => void;
  /** Volta tamanhos e posições dos campos ao padrão do app */
  onRestaurarPadrao?: () => void;
  /** Grava as preferências (usuarios.config_listas) ao concluir a customização */
  onSalvarLayout?: () => void;
}

/**
 * Padrões fixos das props opcionais: um [] ou {} novo a cada render mudaria as
 * dependências dos campos e reiniciaria os valores digitados a cada tecla.
 */
const SEM_ORDEM: string[] = [];
const SEM_TAMANHOS: Record<string, TamanhoCampo> = {};

/** Colunas do formulário no desktop (tem que bater com lg:grid-cols-4 do grid) */
const COLUNAS_FORM = 4;

/**
 * Alças de redimensionamento: 4 cantos + 4 meios. Ficam por fora do campo, cobrindo a borda
 * (outline a 4px) e passando 2px dela.
 */
const ALCAS: { dir: string; className: string }[] = [
  { dir: 'nw', className: 'top-0 left-0 -translate-x-full -translate-y-full cursor-nwse-resize' },
  { dir: 'n', className: 'top-0 left-1/2 -translate-x-1/2 -translate-y-full cursor-ns-resize' },
  { dir: 'ne', className: 'top-0 right-0 translate-x-full -translate-y-full cursor-nesw-resize' },
  { dir: 'e', className: 'top-1/2 right-0 translate-x-full -translate-y-1/2 cursor-ew-resize' },
  { dir: 'se', className: 'bottom-0 right-0 translate-x-full translate-y-full cursor-nwse-resize' },
  { dir: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full cursor-ns-resize' },
  { dir: 'sw', className: 'bottom-0 left-0 -translate-x-full translate-y-full cursor-nesw-resize' },
  { dir: 'w', className: 'top-1/2 left-0 -translate-x-full -translate-y-1/2 cursor-ew-resize' },
];

/** Sistemas ligados a cada cadastro (bloco de interruptores no formulário) */
const LIGACOES: Record<string, { campo: string; rotulo: string; dica?: string }> = {
  usuarios: { campo: 'sistemas', rotulo: 'Sistemas liberados' },
  sistemas: {
    campo: 'relacionados',
    rotulo: 'Sistemas relacionados',
    dica: 'Módulos ligados a este (ex.: transmissão da NF-e, financeiro). A ligação vale para os dois lados: nas conversas de um, o repositório do outro abre junto. Também dá para ligar em Cadastros › Ecossistema.',
  },
};

/** Valor inicial de cada campo ao abrir o formulário */
function initialValue(field: FieldDef, record: RegistroCrud | null): any {
  if (record) {
    const raw = record[field.name];
    if (raw === null || raw === undefined) return '';
    if (field.type === 'boolean') return Number(raw) === 1;
    if (field.type === 'password') return '';
    return String(raw);
  }

  // Padrões para um registro novo: o declarado no metadado ou um valor sensato
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case 'boolean':
      return field.name === 'ativo';
    case 'enum':
      return field.required ? field.options?.[0]?.value ?? '' : '';
    default:
      return '';
  }
}

export const RecordForm: React.FC<RecordFormProps> = ({
  resource,
  record,
  onCancel,
  onSave,
  colunasVisiveis,
  onAlternarColuna,
  camposBusca,
  onAlternarBusca,
  ordemCampos = SEM_ORDEM,
  onReordenarCampos,
  tamanhosCampos = SEM_TAMANHOS,
  onRedimensionarCampo,
  onRestaurarPadrao,
  onSalvarLayout,
}) => {
  const isEdit = Boolean(record);
  const formRef = useRef<HTMLFormElement>(null);
  // Inclusão: o foco já vem no primeiro campo vazio (os que já vêm com o padrão ficam para trás)
  useEffect(() => {
    if (record) return;
    const id = requestAnimationFrame(() => {
      const campos: HTMLInputElement[] = Array.from(
        formRef.current?.querySelectorAll<HTMLInputElement>(
          'input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
        ) ?? [],
      );
      (campos.find((c) => !c.value) ?? campos[0])?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [record]);

  /**
   * Sistemas ligados, editados no próprio cadastro e gravados junto no Salvar (null = carregando):
   * usuário -> sistemas liberados no chat; sistema -> sistemas relacionados (abertos junto na conversa)
   */
  const ligacao = LIGACOES[resource.name];
  const comSistemas = Boolean(ligacao);
  const [todosSistemas, setTodosSistemas] = useState<{ id: number; nome: string }[] | null>(null);
  const [liberados, setLiberados] = useState<number[] | null>(comSistemas && !record ? [] : null);
  useEffect(() => {
    if (!comSistemas) return;
    let vivo = true;
    listRecords('sistemas', { limit: 200, sort: 'nome', dir: 'asc' })
      .then((d) => vivo && setTodosSistemas(d.data.map((s) => ({ id: Number(s.id), nome: String(s.nome) }))))
      .catch((err) => vivo && setError(err.message || 'Não foi possível carregar os sistemas.'));
    if (record)
      fetchLigados(resource.name, String(record[resource.pk[0]]))
        .then((ids) => vivo && setLiberados(ids))
        .catch((err) => vivo && setError(err.message || 'Não foi possível carregar os sistemas liberados.'));
    return () => {
      vivo = false;
    };
  }, [comSistemas, record, resource]);

  // Ícones de customização dos rótulos (coluna, lupa, mover) começam escondidos
  const [mostrarIcones, setMostrarIcones] = useState(false);

  /** Sistema: botão "Montar mapa" (o agente percorre o repositório do formulário e escreve no campo) */
  const comMapa = resource.name === 'sistemas';
  const [montandoMapa, setMontandoMapa] = useState(false);
  const [confirmarMapa, setConfirmarMapa] = useState(false);
  const montarMapa = async () => {
    setConfirmarMapa(false);
    if (!String(values.repo_url || '').trim()) {
      setError('Preencha o Repositório antes de montar o mapa.');
      return;
    }
    setMontandoMapa(true);
    setError(null);
    const anterior = String(values.mapa || '');
    setValues((v) => ({ ...v, mapa: '' }));
    try {
      const r = await chamar('POST', '/api/mapa', {
        id: record?.id,
        repo_url: values.repo_url,
        branch: values.branch,
        github_token: values.github_token,
      });
      const leitor = r.body!.getReader();
      const decodificador = new TextDecoder();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        const t = decodificador.decode(value, { stream: true });
        setValues((v) => ({ ...v, mapa: String(v.mapa || '') + t }));
      }
    } catch (err: any) {
      // Falhou antes de começar: volta o mapa que havia
      setValues((v) => ({ ...v, mapa: String(v.mapa || '') || anterior }));
      setError(err.message || 'Não foi possível montar o mapa.');
    } finally {
      setMontandoMapa(false);
    }
  };

  /** Rótulo do campo + ícones de coluna, busca avançada e mover */
  const rotulo = (f: FieldDef) => {
    const naLista = colunasVisiveis?.includes(f.name) ?? false;
    const naBusca = camposBusca?.includes(f.name) ?? false;
    return (
      <div className="flex items-center gap-1.5 min-h-[18px]">
        <label htmlFor={`form-${resource.name}-${f.name}`} className={LABEL_CLASS}>
          {f.label}
          {f.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
        {comMapa && f.name === 'mapa' && (
          <button
            type="button"
            onClick={() => setConfirmarMapa(true)}
            disabled={montandoMapa}
            title="O agente percorre o repositório e escreve o mapa aqui; você revisa e salva"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 disabled:opacity-60 disabled:cursor-default"
          >
            {montandoMapa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {montandoMapa ? 'Montando o mapa…' : 'Montar mapa'}
          </button>
        )}
        {mostrarIcones && onAlternarColuna && f.type !== 'password' && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onAlternarColuna(f.name)}
            title={naLista ? 'Ocultar esta coluna da lista' : 'Mostrar esta coluna na lista'}
            aria-pressed={naLista}
            className={`p-0.5 rounded cursor-pointer transition-colors ${
              naLista ? 'text-blue-600 dark:text-blue-400' : 'text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
          </button>
        )}
        {mostrarIcones && onAlternarBusca && f.type !== 'password' && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onAlternarBusca(f.name)}
            title={naBusca ? 'Tirar este campo da busca avançada' : 'Usar este campo na busca avançada'}
            aria-pressed={naBusca}
            className={`p-0.5 rounded cursor-pointer transition-colors ${
              naBusca ? 'text-blue-600 dark:text-blue-400' : 'text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )}
        {mostrarIcones && onReordenarCampos && (
          <span
            draggable
            onDragStart={(e) => {
              arrastando.current = f;
              e.dataTransfer.effectAllowed = 'move';
              // A "fotografia" arrastada é o campo inteiro, não só o ícone
              const campo = (e.currentTarget as HTMLElement).closest('[data-campo]');
              if (campo) e.dataTransfer.setDragImage(campo, 12, 12);
            }}
            onDragEnd={() => {
              arrastando.current = null;
              setAlvo(null);
            }}
            title="Arraste para reposicionar o campo"
            className="ml-auto p-0.5 rounded cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400"
          >
            <Move className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    );
  };

  const editableFields = useMemo(
    () =>
      resource.fields
        .filter((f) => {
          if (f.readOnly) return false;
          if (resource.autoIncrement && resource.pk.includes(f.name)) return false;
          // A chave composta não pode ser alterada depois de criada
          if (isEdit && !resource.autoIncrement && resource.pk.includes(f.name)) return false;
          return true;
        })
        .sort((a, b) => {
          const pos = (nome: string) => {
            const i = ordemCampos.indexOf(nome);
            return i < 0 ? ordemCampos.length : i;
          };
          return pos(a.name) - pos(b.name);
        }),
    [resource, isEdit, ordemCampos],
  );

  // Arraste de campos para reposicioná-los no formulário
  const arrastando = useRef<FieldDef | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const propsArraste = (f: FieldDef) =>
    onReordenarCampos
      ? {
          'data-campo': f.name,
          onDragOver: (e: React.DragEvent) => {
            if (!arrastando.current) return;
            e.preventDefault();
            if (alvo !== f.name) setAlvo(f.name);
          },
          onDragLeave: () => setAlvo((atual) => (atual === f.name ? null : atual)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const origem = arrastando.current;
            arrastando.current = null;
            setAlvo(null);
            if (!origem || origem.name === f.name) return;
            const nomes = editableFields.map((c) => c.name).filter((n) => n !== origem.name);
            nomes.splice(nomes.indexOf(f.name), 0, origem.name);
            onReordenarCampos(nomes);
          },
        }
      : {};

  const readOnlyFields = useMemo(() => resource.fields.filter((f) => f.readOnly && record && record[f.name] != null), [resource, record]);

  const [values, setValues] = useState<Record<string, any>>(() => {
    const next: Record<string, any> = {};
    for (const f of editableFields) next[f.name] = initialValue(f, record);
    return next;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealPassword, setRevealPassword] = useState(false);
  // Recarrega o formulário quando a aba passa a apontar para outro registro
  useEffect(() => {
    const next: Record<string, any> = {};
    for (const f of editableFields) next[f.name] = initialValue(f, record);
    setValues(next);
    setError(null);
    setRevealPassword(false);
  }, [record, editableFields]);

  const setValue = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Só o próprio formulário salva (formulários em portal também disparam este evento pela árvore do React)
    if (e.target !== e.currentTarget) return;
    setIsSaving(true);
    setError(null);

    try {
      const payload: RegistroCrud = {};
      for (const f of editableFields) {
        let v = values[f.name];
        if (f.type === 'boolean') v = v ? 1 : 0;
        if (f.type === 'password' && String(v ?? '').trim() === '') continue;
        payload[f.name] = v === '' ? null : v;
      }
      // Sem a lista carregada, os sistemas liberados ficam como estão
      if (ligacao && liberados) payload[ligacao.campo] = liberados;
      await onSave(payload);
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o registro.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = `${INPUT_CLASS} w-full`;

  const renderField = (field: FieldDef) => {
    const value = values[field.name] ?? '';
    const inputId = `form-${resource.name}-${field.name}`;

    switch (field.type) {
      case 'boolean':
        return <Toggle id={inputId} checked={Boolean(value)} onChange={(v) => setValue(field.name, v)} />;

      case 'enum':
        return (
          <select
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            required={Boolean(field.required)}
            className={`${inputClass} cursor-pointer`}
          >
            {!field.required && <option value="">— Nenhum —</option>}
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            rows={field.rows ?? 3}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            required={Boolean(field.required)}
            className={`${inputClass} resize-y`}
          />
        );

      case 'password':
        return (
          <div className="relative">
            <input
              id={inputId}
              type={revealPassword ? 'text' : 'password'}
              value={String(value ?? '')}
              onChange={(e) => setValue(field.name, e.target.value)}
              onFocus={(e) => e.target.select()}
              autoComplete="new-password"
              // Na inclusão a senha é obrigatória (o login exige senha cadastrada)
              required={!isEdit && !field.cifrado}
              placeholder={
                isEdit ? 'Deixe em branco para manter o valor atual' : field.placeholder ?? 'Defina a senha inicial'
              }
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setRevealPassword((p) => !p)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
            >
              {revealPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        );

      default:
        return (
          <input
            id={inputId}
            type={field.name === 'email' ? 'email' : 'text'}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            onFocus={(e) => e.target.select()}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            required={Boolean(field.required)}
            className={inputClass}
          />
        );
    }
  };

  /** Campos longos ocupam a linha inteira do grid */
  const isWide = (f: FieldDef) => f.type === 'textarea' || f.maxLength === 255;

  // "Customizar layout": cada campo ganha borda e alças; a largura anda em colunas de um grid
  // de 4 (no desktop) e a altura é a do controle, em px.
  const [customizando, setCustomizando] = useState(false);
  const gradeRef = useRef<HTMLDivElement>(null);
  const spanPadrao = (f: FieldDef) => (isWide(f) ? COLUNAS_FORM : 1);

  const iniciarRedimensionamentoCampo = (e: React.PointerEvent, f: FieldDef, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    const grade = gradeRef.current;
    const campo = (e.currentTarget as HTMLElement).closest('[data-campo]') as HTMLElement | null;
    if (!grade || !campo || !onRedimensionarCampo) return;

    const estilo = getComputedStyle(grade);
    const gap = parseFloat(estilo.columnGap) || 0;
    const colunas = estilo.gridTemplateColumns.split(' ').length;
    const larguraColuna = (grade.clientWidth - gap * (colunas - 1)) / colunas;
    const controle = campo.querySelector('input:not([type=file]), select, textarea') as HTMLElement | null;
    const larguraInicial = campo.offsetWidth;
    const alturaInicial = controle?.offsetHeight || 0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const sinalX = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0;
    const sinalY = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;

    const mover = (ev: PointerEvent) => {
      const tamanho: TamanhoCampo = {};
      // A largura só existe no grid de COLUNAS_FORM colunas (desktop)
      if (sinalX && colunas === COLUNAS_FORM) {
        const largura = larguraInicial + sinalX * (ev.clientX - x0);
        tamanho.span = Math.min(COLUNAS_FORM, Math.max(1, Math.round((largura + gap) / (larguraColuna + gap))));
      }
      if (sinalY && controle) tamanho.altura = Math.max(24, Math.round(alturaInicial + sinalY * (ev.clientY - y0)));
      if (tamanho.span !== undefined || tamanho.altura !== undefined) onRedimensionarCampo(f.name, tamanho);
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = getComputedStyle(e.currentTarget as Element).cursor;
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  /** Variáveis e classes que aplicam o tamanho escolhido ao contêiner do campo */
  const estiloTamanho = (f: FieldDef): React.CSSProperties => {
    const t = tamanhosCampos[f.name] || {};
    return {
      ['--span' as string]: Math.min(t.span ?? spanPadrao(f), COLUNAS_FORM),
      ...(t.altura ? { ['--altura' as string]: `${t.altura}px` } : {}),
    } as React.CSSProperties;
  };
  const classeTamanho = (f: FieldDef) =>
    `campo-span ${tamanhosCampos[f.name]?.altura ? 'campo-altura' : ''} ${customizando ? 'relative outline outline-1 outline-blue-400 outline-offset-4' : ''}`;

  const alcas = (f: FieldDef) =>
    customizando &&
    onRedimensionarCampo &&
    ALCAS.map((alca) => (
      <span
        key={alca.dir}
        onPointerDown={(e) => iniciarRedimensionamentoCampo(e, f, alca.dir)}
        className={`absolute z-10 w-[7px] h-[7px] bg-blue-500 ${alca.className}`}
      />
    ));

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Corpo rolável */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-5xl mx-auto px-5 py-5 space-y-4">
          {onRedimensionarCampo && (
            <div className="flex justify-end gap-1 -mt-3 mb-1">
              {onRestaurarPadrao && (
                <button
                  type="button"
                  onClick={onRestaurarPadrao}
                  title="Voltar tamanhos e posições dos campos ao padrão do app"
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Padrão
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (customizando) onSalvarLayout?.(); // "Concluir" grava
                  setCustomizando(!customizando);
                }}
                title={customizando ? 'Concluir a customização do layout' : 'Customizar o tamanho dos campos'}
                aria-pressed={customizando}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                  customizando
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                }`}
              >
                <Scaling className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mostrarIcones) onSalvarLayout?.(); // esconder os ícones grava o que foi mudado
                  setMostrarIcones(!mostrarIcones);
                }}
                title={mostrarIcones ? 'Esconder os ícones de customização dos campos' : 'Mostrar os ícones de customização dos campos'}
                aria-pressed={mostrarIcones}
                className={`flex items-center px-2 py-1 rounded cursor-pointer transition-colors ${
                  mostrarIcones
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                }`}
              >
                {mostrarIcones ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
          {error && <AvisoErro mensagem={error} onFechar={() => setError(null)} />}

          <div ref={gradeRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {editableFields.map((field) => (
              <div
                key={field.name}
                {...propsArraste(field)}
                style={estiloTamanho(field)}
                className={`${FIELD_CLASS} ${isWide(field) ? 'sm:col-span-2' : ''} ${classeTamanho(field)} ${
                  alvo === field.name ? 'outline-2 outline-dashed outline-blue-400 outline-offset-2' : ''
                }`}
              >
                {alcas(field)}
                {rotulo(field)}
                {renderField(field)}
                {field.hint && <p className={HINT_CLASS}>{field.hint}</p>}
              </div>
            ))}
          </div>

          {/* Usuário: sistemas que ele pode consultar no chat. Sistema: os relacionados, abertos junto na conversa */}
          {ligacao && (
            <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">{ligacao.rotulo}</div>
              {ligacao.dica && <p className={`${HINT_CLASS} mb-2`}>{ligacao.dica}</p>}
              {todosSistemas === null || liberados === null ? (
                <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Carregando…
                </div>
              ) : todosSistemas.length === 0 ? (
                <p className={HINT_CLASS}>Nenhum sistema cadastrado ainda.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {todosSistemas
                    .filter((s) => resource.name !== 'sistemas' || !record || s.id !== Number(record.id))
                    .map((s) => (
                    <Toggle
                      key={s.id}
                      id={`form-${resource.name}-ligado-${s.id}`}
                      checked={liberados.includes(s.id)}
                      onChange={(v) => setLiberados((l) => (v ? [...(l || []), s.id] : (l || []).filter((id) => id !== s.id)))}
                      label={s.nome}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metadados gerados pelo banco */}
          {readOnlyFields.length > 0 && (
            <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Dados gerados pelo banco</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {readOnlyFields.map((f) => (
                  <div key={f.name} className="bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-700/60">
                    <div className="text-[10px] text-stone-500 dark:text-stone-400">{f.label}</div>
                    <div className="text-xs font-mono text-stone-800 dark:text-stone-200 truncate">{String(record?.[f.name] ?? '—')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra de ações fixa ao pé da tela */}
      <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2.5 bg-stone-50 dark:bg-stone-950/40 shrink-0">
        <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
          {isEdit ? `Registro #${resource.pk.map((c) => record?.[c]).join(' / ')} • tabela ${resource.table}` : `Inclusão na tabela ${resource.table}`}
        </span>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancelar</span>
          </button>
          <button
            type="submit"
            id="btn-salvar-registro"
            disabled={isSaving || montandoMapa}
            title={montandoMapa ? 'Espere o mapa terminar de ser montado' : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Salvando…' : 'Salvar'}</span>
          </button>
        </div>
      </div>

      {confirmarMapa && (
        <ConfirmDialog
          titulo="Montar o mapa do sistema?"
          mensagem={
            <>
              O agente vai percorrer o repositório e escrever o mapa no campo. Pode levar alguns minutos e custar até US$ 5,00.
              {String(values.mapa || '').trim() && <strong className="block mt-1 text-stone-700 dark:text-stone-200">O mapa atual será substituído.</strong>}{' '}
              Revise o resultado e clique em Salvar.
            </>
          }
          confirmar="Montar mapa"
          tom={String(values.mapa || '').trim() ? 'perigo' : 'normal'}
          onConfirmar={montarMapa}
          onCancelar={() => setConfirmarMapa(false)}
        />
      )}
    </form>
  );
};
