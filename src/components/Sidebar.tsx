import React, { useEffect, useState } from 'react';
import { Boxes, ChevronLeft, ChevronRight, Headset, History, KeyRound, LockKeyhole, LogOut, MessageSquareText, MessagesSquare, Settings, User, Wallet, X, type LucideIcon } from 'lucide-react';
import { Creditos, fetchCreditos, Sistema, trocarMinhaSenha } from '../api';
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { Usuario } from '../utils/session';
import { EVENTO_CREDITOS } from './ConfigCreditos';
import { ConfirmDialog } from './ConfirmDialog';

const CHAVE_RECOLHIDO = 'autosuporte_menu_recolhido';

/** Opções de cadastro do menu (só administradores); o id é o nome do recurso em server/schema.ts */
const CADASTROS: { id: string; label: string; icone: LucideIcon }[] = [
  { id: 'sistemas', label: 'Sistemas', icone: Boxes },
  { id: 'usuarios', label: 'Usuários', icone: KeyRound },
  { id: 'conversas', label: 'Conversas', icone: MessageSquareText },
];

interface SidebarProps {
  sistemas: Sistema[];
  /** Opção na tela: 'chat:<id do sistema>', 'historico' ou 'crud:<recurso>' */
  ativo: string | null;
  onAbrir: (chave: string) => void;
  usuario: Usuario;
  onLogout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

/** Menu lateral no padrão do crmWeb: cada opção é um sistema do cliente */
export const Sidebar: React.FC<SidebarProps> = ({ sistemas, ativo, onAbrir, usuario, onLogout, isOpenMobile, onCloseMobile }) => {
  // Desktop: menu recolhido (só os ícones), lembrado neste navegador
  const [recolhido, setRecolhido] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_RECOLHIDO) === '1';
    } catch {
      return false;
    }
  });
  const alternar = () =>
    setRecolhido((r) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, r ? '0' : '1');
      } catch {
        // sem storage: vale só até recarregar
      }
      return !r;
    });

  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [senhaOk, setSenhaOk] = useState(false);

  const botao = (chave: string, label: string, Icone: LucideIcon, rec: boolean) => {
    const isActive = ativo === chave;
    return (
      <button
        key={chave}
        id={`sidebar-nav-${chave.replace(':', '-')}`}
        onClick={() => {
          onAbrir(chave);
          onCloseMobile();
        }}
        title={rec ? label : undefined}
        className={`relative w-full flex items-center ${rec ? 'justify-center' : 'px-4'} py-[11px] text-left transition-colors cursor-pointer group border-l-2 ${
          isActive
            ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300'
            : 'border-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icone
            className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
              isActive ? 'text-blue-600 dark:text-blue-300' : 'text-stone-400 group-hover:text-blue-600 dark:text-stone-400 dark:group-hover:text-blue-400'
            }`}
          />
          {!rec && <div className="text-xs truncate">{label}</div>}
        </div>
      </button>
    );
  };

  const conteudo = (rec: boolean) => (
    <div className="flex flex-col h-full bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border-r border-stone-200 dark:border-stone-800 select-none">
      {/* Marca — mesma altura do header da área de trabalho */}
      <div
        className={`h-[var(--altura-topo)] shrink-0 ${rec ? 'justify-center' : 'px-4 justify-between'} border-b border-stone-200 dark:border-stone-800/80 flex items-center gap-3 bg-stone-50/50 dark:bg-transparent`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 min-w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Headset className="w-5 h-5" />
          </div>
          <div className={rec ? 'hidden' : 'min-w-0'}>
            <h1 className="text-sm font-bold text-stone-900 dark:text-white leading-tight truncate">autoSuporte</h1>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">Dúvidas sobre os sistemas</p>
          </div>
        </div>

        <button
          onClick={onCloseMobile}
          id="btn-close-sidebar-mobile"
          title="Fechar menu lateral"
          className="lg:hidden p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navegação: os sistemas que o cliente contratou */}
      <div className="flex-1 overflow-y-auto py-4">
        {!rec && <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-400">Sistemas</div>}
        {sistemas.map((s) => botao(`chat:${s.id}`, s.nome, MessagesSquare, rec))}
        {!sistemas.length && !rec && <p className="px-4 text-xs text-stone-400">Nenhum sistema liberado para o seu acesso.</p>}
        {sistemas.length > 0 && botao('historico', 'Minhas conversas', History, rec)}

        {/* Cadastros: só administradores (o servidor também barra os demais) */}
        {usuario.tipo === 'admin' && (
          <div className="pt-3">
            {rec ? (
              <div className="mx-4 mb-2 border-t border-stone-200 dark:border-stone-800" />
            ) : (
              <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-400">Cadastros</div>
            )}
            {CADASTROS.map((c) => botao(`crud:${c.id}`, c.label, c.icone, rec))}
            {botao('config', 'Configurações', Settings, rec)}
          </div>
        )}
      </div>

      {/* Saldo estimado de créditos: só administradores */}
      {usuario.tipo === 'admin' && <SaldoCreditos rec={rec} onAbrir={() => onAbrir('config')} />}

      {/* Usuário & sair */}
      <div
        className={`p-3 border-t border-stone-200 dark:border-stone-800/80 flex ${rec ? 'flex-col' : ''} items-center justify-between gap-2 bg-stone-50 dark:bg-stone-950/60`}
      >
        <div className="flex items-center gap-2.5 min-w-0" title={rec ? usuario.nome : undefined}>
          <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 flex items-center justify-center font-semibold text-xs shrink-0">
            {usuario.nome ? usuario.nome.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className={rec ? 'hidden' : 'min-w-0'}>
            <div className="text-xs font-semibold text-stone-900 dark:text-white truncate leading-tight">{usuario.nome || 'Usuário'}</div>
            <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5">{usuario.email}</div>
          </div>
        </div>

        <div className={`flex ${rec ? 'flex-col' : ''} items-center gap-1 shrink-0`}>
          <button
            onClick={() => setTrocandoSenha(true)}
            title={senhaOk ? 'Senha alterada' : 'Alterar a minha senha'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              senhaOk ? 'text-emerald-600' : 'text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/50'
            }`}
          >
            <LockKeyhole className="w-4 h-4" />
          </button>
          <button
            id="sidebar-btn-logout"
            onClick={onLogout}
            title="Encerrar sessão"
            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/50 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar fixa no desktop */}
      <aside className={`hidden lg:flex flex-col ${recolhido ? 'w-16' : 'w-64'} shrink-0 h-screen sticky top-0 z-30 transition-[width] duration-200`}>
        {conteudo(recolhido)}
        <button
          type="button"
          id="sidebar-btn-recolher"
          onClick={alternar}
          title={recolhido ? 'Abrir o menu' : 'Esconder o menu'}
          className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-14 rounded-full flex items-center justify-center bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-500 hover:text-blue-600 dark:text-stone-400 dark:hover:text-blue-400 shadow-sm cursor-pointer"
        >
          {recolhido ? <ChevronRight className="w-2.5 h-2.5 shrink-0" strokeWidth={3} /> : <ChevronLeft className="w-2.5 h-2.5 shrink-0" strokeWidth={3} />}
        </button>
      </aside>

      {/* Drawer no mobile */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs transition-opacity" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative flex-1 flex flex-col max-w-xs w-full h-full shadow-2xl z-10">{conteudo(false)}</div>
        </div>
      )}

      {trocandoSenha && (
        <TrocarSenha
          onFechar={() => setTrocandoSenha(false)}
          onFeito={() => {
            setTrocandoSenha(false);
            setSenhaOk(true);
            setTimeout(() => setSenhaOk(false), 4000);
          }}
        />
      )}
    </>
  );
};

/** US$ no formato brasileiro: 1234.5 -> "US$ 1.234,50" */
const dolar = (n: number) => `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Recarrega o saldo a cada 5 minutos (o servidor também guarda por 5: a Anthropic pede no máximo 1 consulta por minuto) */
const RECARGA_MS = 5 * 60 * 1000;

/** Saldo estimado de créditos da Anthropic, acima do usuário; clicar abre as Configurações */
const SaldoCreditos: React.FC<{ rec: boolean; onAbrir: () => void }> = ({ rec, onAbrir }) => {
  const [c, setC] = useState<Creditos | null>(null);

  useEffect(() => {
    const carregar = () =>
      fetchCreditos()
        .then(setC)
        .catch(() => setC(null));
    carregar();
    const t = window.setInterval(carregar, RECARGA_MS);
    window.addEventListener(EVENTO_CREDITOS, carregar);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(EVENTO_CREDITOS, carregar);
    };
  }, []);

  if (!c) return null;
  const baixo = c.estimado !== undefined && Boolean(c.alerta) && c.estimado < (c.alerta ?? 0);
  const cor = c.erro ? 'text-amber-600 dark:text-amber-400' : baixo ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
  const [d, m, a] = [c.data?.slice(8, 10), c.data?.slice(5, 7), c.data?.slice(0, 4)];
  const titulo = !c.configurado
    ? 'Informe o saldo do Console em Configurações › Créditos'
    : c.erro
    ? c.erro
    : `${dolar(c.saldo ?? 0)} em ${d}/${m}/${a} − ${dolar(c.gasto ?? 0)} gastos desde então (estimativa; o valor exato está no Console)`;

  return (
    <button
      type="button"
      onClick={onAbrir}
      title={titulo}
      className={`mx-3 mb-2 flex items-center gap-2.5 ${rec ? 'justify-center' : ''} px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/60 cursor-pointer text-left`}
    >
      <Wallet className={`w-4 h-4 shrink-0 ${cor}`} />
      {!rec && (
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-400">Créditos Anthropic</div>
          <div className={`text-xs font-bold truncate ${cor}`}>
            {!c.configurado ? 'Informar saldo' : c.erro ? 'Saldo indisponível' : `${dolar(c.estimado ?? 0)} (estimado)`}
          </div>
        </div>
      )}
    </button>
  );
};

/** Troca da própria senha: atual + nova duas vezes (mínimo de 4) */
const TrocarSenha: React.FC<{ onFechar: () => void; onFeito: () => void }> = ({ onFechar, onFeito }) => {
  const [v, setV] = useState({ atual: '', nova: '', repetir: '' });
  const campo = (k: 'atual' | 'nova' | 'repetir', rotulo: string, primeiro = false) => (
    <div className={FIELD_CLASS}>
      <label htmlFor={`senha-${k}`} className={LABEL_CLASS}>
        {rotulo}
      </label>
      <input
        id={`senha-${k}`}
        type="password"
        required
        autoFocus={primeiro}
        autoComplete={k === 'atual' ? 'current-password' : 'new-password'}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
        onFocus={(e) => e.target.select()}
        className={`${INPUT_CLASS} w-full`}
      />
    </div>
  );
  return (
    <ConfirmDialog
      titulo="Alterar a minha senha"
      mensagem="Informe a senha atual e a nova (pelo menos 4 caracteres)."
      confirmar="Alterar senha"
      tom="normal"
      onConfirmar={async () => {
        if (v.nova.length < 4) throw new Error('A nova senha precisa ter pelo menos 4 caracteres.');
        if (v.nova !== v.repetir) throw new Error('A confirmação não é igual à nova senha.');
        await trocarMinhaSenha(v.atual, v.nova);
        onFeito();
      }}
      onCancelar={onFechar}
    >
      <div className="flex flex-col gap-3">
        {campo('atual', 'Senha atual', true)}
        {campo('nova', 'Nova senha')}
        {campo('repetir', 'Repita a nova senha')}
      </div>
    </ConfirmDialog>
  );
};
