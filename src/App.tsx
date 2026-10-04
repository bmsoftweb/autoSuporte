import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare, Pencil } from 'lucide-react';
import { definirAoExpirar, definirToken, fetchResources, fetchSistemas, renomearConversa, Sistema } from './api';
import { ChatSistema } from './components/ChatSistema';
import { ConfiguracoesView } from './components/ConfiguracoesView';
import { EcossistemaView } from './components/EcossistemaView';
import { ConversaView } from './components/ConversaView';
import { RenomearConversa } from './components/NomeConversa';
import { CrudView } from './components/CrudView';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { Sidebar } from './components/Sidebar';
import { ResourceDef } from './types';
import { limparConfigListas } from './utils/configListas';
import { lerSessao, limparSessao, salvarSessao, Sessao } from './utils/session';
import { applyTheme, getInitialTheme, ThemeMode } from './utils/theme';

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [sessao, setSessao] = useState<Sessao | null>(() => {
    const s = lerSessao();
    if (s) definirToken(s.token);
    return s;
  });
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [erroSistemas, setErroSistemas] = useState('');
  /** Metadados dos cadastros (só administradores) */
  const [resources, setResources] = useState<ResourceDef[]>([]);
  /** Opção na tela: 'chat:<id>', 'historico' (Minhas conversas), 'config', 'ecossistema' ou 'crud:<recurso>' */
  const [ativo, setAtivo] = useState<string | null>(null);
  /** Chats já abertos: ficam montados para manter a conversa */
  const [abertos, setAbertos] = useState<number[]>([]);
  const [novaTokens, setNovaTokens] = useState<Record<number, number>>({});
  /** Conversa antiga a reabrir no chat de cada sistema (seq novo = carregar de novo) */
  const [carregar, setCarregar] = useState<Record<number, { sessao: string; seq: number }>>({});
  /** Muda a cada abertura de "Minhas conversas", para a lista vir atualizada */
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  /** Conversa sendo renomeada na grade de Minhas conversas */
  const [renomeando, setRenomeando] = useState<{ sessao: string; titulo: string; recarregar: () => void } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [createToken, setCreateToken] = useState(0);
  const [versaoSistemas, setVersaoSistemas] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => applyTheme(theme), [theme]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((atual) => (atual === msg ? null : atual)), 3000);
  }, []);

  const sair = (aviso: string | null = null) => {
    limparSessao();
    limparConfigListas();
    definirToken('');
    setSessao(null);
    setSistemas([]);
    setResources([]);
    setAtivo(null);
    setAbertos([]);
    setAvisoLogin(aviso);
  };

  useEffect(() => {
    definirAoExpirar((msg) => sair(msg));
  }, []);

  const abrir = (chave: string) => {
    setAtivo(chave);
    if (chave === 'historico') setVersaoHistorico((v) => v + 1);
    if (chave.startsWith('chat:')) {
      const id = Number(chave.slice(5));
      setAbertos((a) => (a.includes(id) ? a : [...a, id]));
    }
  };

  useEffect(() => {
    if (!sessao) return;
    setErroSistemas('');
    fetchSistemas()
      .then((lista) => {
        setSistemas(lista);
        // Um sistema só: já abre o chat dele (no primeiro carregamento)
        if (lista.length === 1 && versaoSistemas === 0) abrir(`chat:${lista[0].id}`);
      })
      .catch((err) => setErroSistemas(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao, versaoSistemas]);

  // Metadados das grades: administrador recebe todos; cliente, só os públicos (Minhas conversas)
  useEffect(() => {
    if (!sessao) return;
    fetchResources()
      .then(setResources)
      .catch(() => setResources([]));
  }, [sessao]);

  const alternarTema = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  if (!sessao) {
    return (
      <LoginView
        avisoInicial={avisoLogin}
        theme={theme}
        onToggleTheme={alternarTema}
        onLoginSuccess={(usuario, token, lembrar) => {
          const nova = { usuario, token };
          definirToken(token);
          salvarSessao(nova, lembrar);
          setAvisoLogin(null);
          setSessao(nova);
        }}
      />
    );
  }

  const sistemaAtivo = ativo?.startsWith('chat:') ? sistemas.find((s) => s.id === Number(ativo.slice(5))) : undefined;
  const recursoAtivo = ativo?.startsWith('crud:') ? resources.find((r) => r.name === ativo.slice(5)) : undefined;

  const [titulo, subtitulo] = sistemaAtivo
    ? [sistemaAtivo.nome, 'Tire sua dúvida sobre o sistema; se quiser, mande um print da tela']
    : recursoAtivo
    ? [recursoAtivo.label, recursoAtivo.description]
    : ativo === 'historico'
    ? ['Minhas conversas', 'Suas dúvidas anteriores; clique numa conversa para continuar']
    : ativo === 'config'
    ? ['Configurações', 'Preferências do app, por grupo']
    : ativo === 'ecossistema'
    ? ['Fluxograma', 'Ligações entre os sistemas: nas conversas de um sistema, os repositórios ligados a ele abrem junto']
    : ['Suporte', 'Escolha uma opção no menu'];

  const recursoHistorico = resources.find((r) => r.name === 'minhas_conversas');

  /** Reabre uma conversa antiga no chat do sistema dela */
  const reabrirConversa = (sessao: string, sistemaId: number) => {
    setCarregar((c) => ({ ...c, [sistemaId]: { sessao, seq: (c[sistemaId]?.seq || 0) + 1 } }));
    abrir(`chat:${sistemaId}`);
  };

  return (
    <div className="h-screen overflow-hidden bg-stone-100/70 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[70] bg-stone-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-stone-800 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Sidebar
        sistemas={sistemas}
        ativo={ativo}
        onAbrir={abrir}
        usuario={sessao.usuario}
        onLogout={() => sair()}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header
          title={titulo}
          subtitle={subtitulo}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onRefresh={recursoAtivo || ativo === 'historico' ? () => setRefreshToken((t) => t + 1) : undefined}
          onCreate={
            sistemaAtivo
              ? () => setNovaTokens((n) => ({ ...n, [sistemaAtivo.id]: (n[sistemaAtivo.id] || 0) + 1 }))
              : recursoAtivo?.canCreate
              ? () => setCreateToken((t) => t + 1)
              : undefined
          }
          createLabel={sistemaAtivo ? 'Nova conversa' : recursoAtivo ? `Novo ${recursoAtivo.labelSingular}` : undefined}
          theme={theme}
          onToggleTheme={alternarTema}
        />

        {abertos.map((id) => {
          const s = sistemas.find((x) => x.id === id);
          return (
            s && <ChatSistema key={id} sistema={s} visivel={ativo === `chat:${id}`} novaToken={novaTokens[id] || 0} carregar={carregar[id] ?? null} />
          );
        })}

        {ativo === 'historico' && recursoHistorico && (
          <CrudView
            // Remonta a cada abertura de Minhas conversas: a lista vem atualizada com as conversas novas
            key={`historico-${versaoHistorico}`}
            resource={recursoHistorico}
            refreshToken={refreshToken}
            createToken={0}
            onToast={showToast}
            onAbrirLinha={(row) => reabrirConversa(String(row.sessao_id), Number(row.sistema_id))}
            acoesLinha={(row, { recarregar }) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenomeando({ sessao: String(row.sessao_id), titulo: String(row.titulo ?? ''), recarregar });
                }}
                title="Dar um nome a esta conversa"
                className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          />
        )}

        {renomeando && (
          <RenomearConversa
            titulo={renomeando.titulo}
            onSalvar={async (titulo) => {
              await renomearConversa(renomeando.sessao, titulo);
              renomeando.recarregar();
              showToast('Nome da conversa gravado.');
            }}
            onFechar={() => setRenomeando(null)}
          />
        )}

        {recursoAtivo && (
          <CrudView
            key={recursoAtivo.name}
            resource={recursoAtivo}
            refreshToken={refreshToken}
            createToken={createToken}
            onToast={showToast}
            // Sistema incluído, renomeado ou liberado: o menu do chat recarrega
            onAlterado={() => setVersaoSistemas((v) => v + 1)}
            renderEditor={recursoAtivo.name === 'conversas' ? (record, fechar) => <ConversaView record={record} onFechar={fechar} /> : undefined}
          />
        )}

        {ativo === 'config' && sessao.usuario.tipo === 'admin' && <ConfiguracoesView onToast={showToast} />}
        {ativo === 'ecossistema' && (sessao.usuario.tipo === 'admin' || sessao.usuario.tipo === 'tecnico') && (
          <EcossistemaView onToast={showToast} somenteLeitura={sessao.usuario.tipo !== 'admin'} />
        )}

        {!sistemaAtivo && !recursoAtivo && ativo !== 'historico' && ativo !== 'config' && ativo !== 'ecossistema' && (
          <main className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center text-stone-500 dark:text-stone-400">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-center">
              <MessagesSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            {erroSistemas ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">{erroSistemas}</p>
            ) : (
              <>
                <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">Olá, {sessao.usuario.nome.split(' ')[0]}!</p>
                <p className="text-xs max-w-sm">Escolha no menu o sistema sobre o qual você quer tirar uma dúvida.</p>
              </>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
