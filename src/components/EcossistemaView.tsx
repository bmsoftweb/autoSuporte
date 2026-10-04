import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  BaseEdge,
  getSmoothStepPath,
  useNodes,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Boxes, Loader2, Map, Save, Square } from 'lucide-react';
import { chamar } from '../api';
import { HINT_CLASS } from '../utils/formStyles';
import { caminhoSvg, rotaDesvio } from '../utils/rotaDesvio';
import { AvisoErro } from './AvisoErro';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Fluxograma: quadro único com os sistemas da empresa. Administrador altera; técnico só vê (somenteLeitura).
 * Arraste um sistema da lista para o quadro e ligue a bolinha de baixo de um sistema ao de outro:
 * A ligação é mútua: nas conversas de um, o repositório do outro abre junto (sistemas relacionados).
 */

type SistemaEco = {
  id: number;
  nome: string;
  repo: string;
  tem_mapa: boolean;
};
type NoSistema = Node<SistemaEco, 'sistema'>;

const MIME = 'application/x-ecossistema-sistema';

/** Técnico: quadro só para ver (sem arrastar, ligar, renomear grupo nem salvar) */
const SomenteLeitura = React.createContext(false);

/** Tema escuro do app (classe "dark" no <html>), acompanhando a troca pelo botão do cabeçalho */
function useTemaEscuro() {
  const [escuro, setEscuro] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const o = new MutationObserver(() => setEscuro(document.documentElement.classList.contains('dark')));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
  return escuro;
}

const CardSistema: React.FC<NodeProps<NoSistema>> = ({ data, selected }) => {
  const leitura = React.useContext(SomenteLeitura);
  return (
  <div
    className={`w-56 rounded-xl border-2 bg-white dark:bg-stone-900 shadow-sm ${
      selected ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-stone-300 dark:border-stone-700'
    }`}
  >
    {PONTOS.map((p) => (
      <Handle key={p.id} id={p.id} type="source" position={p.lado} style={p.estilo} className={`!w-3 !h-3 !bg-blue-500 !border-2 !border-white dark:!border-stone-900 ${leitura ? '!opacity-0' : ''}`} />
    ))}
    <div className="flex items-center gap-2 px-3 py-2 rounded-t-[10px] bg-blue-50 dark:bg-blue-950/50">
      <Boxes className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <span className="text-xs font-bold truncate text-blue-700 dark:text-blue-300">{data.nome}</span>
    </div>
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-stone-500 dark:text-stone-400">
      <span className="truncate flex-1" title={data.repo}>
        {data.repo}
      </span>
      {data.tem_mapa && <Map className="w-3 h-3 shrink-0 text-emerald-600" aria-label="Tem mapa" />}
    </div>
  </div>
  );
};

/** 5 pontos de contato por sistema; cada um serve de entrada e de saída (o sentido é de onde se começou a arrastar) */
const PONTOS: { id: string; lado: Position; estilo?: React.CSSProperties }[] = [
  { id: 't', lado: Position.Top },
  { id: 'r', lado: Position.Right },
  { id: 'b1', lado: Position.Bottom, estilo: { left: '30%' } },
  { id: 'b2', lado: Position.Bottom, estilo: { left: '70%' } },
  { id: 'l', lado: Position.Left },
];
const PONTO_VALIDO = new Set(PONTOS.map((p) => p.id));

/** Grupo: retângulo com título só para identificar áreas do quadro (não muda nada nas conversas) */
type DadosGrupo = { titulo: string };
type NoGrupo = Node<DadosGrupo, 'grupo'>;
type NoQuadro = NoSistema | NoGrupo;

const CardGrupo: React.FC<NodeProps<NoGrupo>> = ({ id, data, selected }) => {
  const { updateNodeData } = useReactFlow();
  const leitura = React.useContext(SomenteLeitura);
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={110} lineClassName="!border-blue-400" handleClassName="!w-2.5 !h-2.5 !bg-blue-500" />
      <div
        className={`w-full h-full rounded-2xl border-2 border-dashed ${
          selected ? 'border-blue-400' : 'border-stone-300 dark:border-stone-700'
        } bg-stone-100/50 dark:bg-stone-800/30`}
      >
        <input
          value={data.titulo}
          onChange={(e) => updateNodeData(id, { titulo: e.target.value })}
          onFocus={(e) => e.target.select()}
          maxLength={60}
          readOnly={leitura}
          tabIndex={leitura ? -1 : undefined}
          placeholder="Nome do grupo"
          aria-label="Nome do grupo"
          className="nodrag sem-barra m-2 px-2 py-1 w-[calc(100%-1rem)] bg-transparent text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 rounded-md outline-none focus:bg-white dark:focus:bg-stone-900"
        />
      </div>
    </>
  );
};

const TIPOS_RF = { sistema: CardSistema, grupo: CardGrupo };
const GRUPO = 'grupo'; // valor arrastado da lista para criar um grupo
const novoIdGrupo = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Ligação em ângulo reto que contorna os quadros (sem passar por trás de nenhum) */
const SAIDA = 20; // a linha sai reto do ponto de contato antes de virar
const DIR: Record<Position, number> = { [Position.Right]: 0, [Position.Left]: 1, [Position.Bottom]: 2, [Position.Top]: 3 };
const afasta = (x: number, y: number, lado: Position) =>
  lado === Position.Top ? { x, y: y - SAIDA } : lado === Position.Bottom ? { x, y: y + SAIDA } : lado === Position.Left ? { x: x - SAIDA, y } : { x: x + SAIDA, y };

const LigacaoDesvio: React.FC<EdgeProps> = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style }) => {
  const nodes = useNodes();
  const caminho = useMemo(() => {
    const quadros = nodes.filter((n) => n.type === 'sistema').map((n) => ({ x: n.position.x, y: n.position.y, w: n.measured?.width ?? 224, h: n.measured?.height ?? 60 }));
    const a = afasta(sourceX, sourceY, sourcePosition);
    const b = afasta(targetX, targetY, targetPosition);
    const pts = rotaDesvio(a, b, quadros, DIR[sourcePosition]);
    if (!pts) return getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })[0];
    return caminhoSvg([{ x: sourceX, y: sourceY }, ...pts, { x: targetX, y: targetY }]);
  }, [nodes, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);
  return <BaseEdge id={id} path={caminho} style={style} interactionWidth={16} />;
};

const TIPOS_LIGACAO = { desvio: LigacaoDesvio };
const LINHA = { type: 'desvio', style: { strokeWidth: 2 } };
const idLigacao = (de: string, para: string) => `${de}>${para}`;

const Editor: React.FC<{ onToast: (msg: string) => void; somenteLeitura: boolean }> = ({ onToast, somenteLeitura }) => {
  const [sistemas, setSistemas] = useState<SistemaEco[] | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<NoQuadro>([]);
  /** Arrastando um grupo: posição inicial dele e dos sistemas que estavam dentro (vão junto) */
  const arrasteGrupo = useRef<{ x: number; y: number; filhos: globalThis.Map<string, { x: number; y: number }> } | null>(null);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; ok: (v: boolean) => void } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const quadroRef = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  const escuro = useTemaEscuro();

  useEffect(() => {
    chamar('GET', '/api/ecossistema')
      .then((r) => r.json())
      .then(
        (d: {
          sistemas: SistemaEco[];
          ligacoes: { de: number; para: number; s?: string; t?: string }[];
          posicoes: Record<string, { x: number; y: number }>;
          grupos: { id: string; titulo: string; x: number; y: number; w: number; h: number }[];
        }) => {
        setSistemas(d.sistemas);
        // No quadro: os que têm posição gravada e os que já têm ligação (estes, enfileirados embaixo)
        const ligados = new Set(d.ligacoes.flatMap((l) => [l.de, l.para]));
        let fila = 0;
        const maxY = Math.max(0, ...Object.values(d.posicoes).map((p) => p.y));
        // Grupos primeiro: ficam atrás dos sistemas
        setNodes([
          ...d.grupos.map(
            (g): NoGrupo => ({ id: g.id, type: 'grupo', position: { x: g.x, y: g.y }, width: g.w, height: g.h, zIndex: 0, data: { titulo: g.titulo } }),
          ),
          ...d.sistemas
            .filter((s) => d.posicoes[s.id] || ligados.has(s.id))
            .map(
              (s): NoSistema => ({
                id: String(s.id),
                type: 'sistema',
                position: d.posicoes[s.id] ?? { x: (fila++ % 4) * 260, y: maxY + 160 + Math.floor((fila - 1) / 4) * 120 },
                zIndex: 1,
                data: s,
              }),
            ),
        ]);
        // Sem ponto gravado (ligação feita pelo cadastro): sai de baixo e entra em cima
        setEdges(
          d.ligacoes.map((l) => ({
            id: idLigacao(String(l.de), String(l.para)),
            source: String(l.de),
            target: String(l.para),
            sourceHandle: PONTO_VALIDO.has(l.s ?? '') ? l.s : 'b1',
            targetHandle: PONTO_VALIDO.has(l.t ?? '') ? l.t : 't',
            ...LINHA,
          })),
        );
        setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1 }), 50);
        },
      )
      .catch((e) => setErro(e.message));
  }, [rf, setEdges, setNodes]);

  const noQuadro = new Set(nodes.map((n) => n.id));
  const foraDoQuadro = (sistemas ?? []).filter((s) => !noQuadro.has(String(s.id)));

  /** Sistema novo no quadro: onde foi solto (arrastar) ou no centro (clique) */
  const adicionar = (s: SistemaEco, solto?: { x: number; y: number }) => {
    const r = quadroRef.current?.getBoundingClientRect();
    const centro = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    // Clique: em grade a partir do centro (3 por linha), para um não cair em cima do outro
    const n = nodes.length % 9;
    const p = solto ?? { x: centro.x - 260 + (n % 3) * 260, y: centro.y - 120 + Math.floor(n / 3) * 130 };
    setNodes((ns) => [...ns, { id: String(s.id), type: 'sistema', position: { x: p.x - 112, y: p.y - 24 }, zIndex: 1, data: s }]);
    setAlterado(true);
  };

  /** Grupo novo: onde foi solto ou no centro; entra no começo da lista para ficar atrás dos sistemas */
  const adicionarGrupo = (solto?: { x: number; y: number }) => {
    const r = quadroRef.current?.getBoundingClientRect();
    const p = solto ?? (r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 });
    const g: NoGrupo = { id: novoIdGrupo(), type: 'grupo', position: { x: p.x - 200, y: p.y - 130 }, width: 400, height: 260, zIndex: 0, data: { titulo: '' } };
    setNodes((ns) => [g, ...ns]);
    setAlterado(true);
  };

  /** Sistemas inteiramente dentro do grupo, para irem junto quando ele for arrastado */
  const iniciarArrasteGrupo = (_: unknown, no: NoQuadro) => {
    if (no.type !== 'grupo') {
      arrasteGrupo.current = null;
      return;
    }
    const w = no.width ?? no.measured?.width ?? 0;
    const h = no.height ?? no.measured?.height ?? 0;
    const filhos = new globalThis.Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      if (n.type !== 'sistema') continue;
      const nw = n.measured?.width ?? 224;
      const nh = n.measured?.height ?? 60;
      if (n.position.x >= no.position.x && n.position.y >= no.position.y && n.position.x + nw <= no.position.x + w && n.position.y + nh <= no.position.y + h) {
        filhos.set(n.id, { ...n.position });
      }
    }
    arrasteGrupo.current = { ...no.position, filhos };
  };
  const arrastarGrupo = (_: unknown, no: NoQuadro) => {
    const a = arrasteGrupo.current;
    if (!a || no.type !== 'grupo' || !a.filhos.size) return;
    const dx = no.position.x - a.x;
    const dy = no.position.y - a.y;
    setNodes((ns) => ns.map((n) => (a.filhos.has(n.id) ? { ...n, position: { x: a.filhos.get(n.id)!.x + dx, y: a.filhos.get(n.id)!.y + dy } } : n)));
  };

  const onConnect = useCallback(
    (c: Connection) => {
      // Uma ligação por par de sistemas (em qualquer sentido): ligar de novo só troca os pontos usados
      setEdges((es) => [
        ...es.filter((e) => !((e.source === c.source && e.target === c.target) || (e.source === c.target && e.target === c.source))),
        { id: idLigacao(c.source, c.target), source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle, ...LINHA },
      ]);
      setAlterado(true);
    },
    [setEdges],
  );

  // Tirar do quadro (Delete) sempre pergunta antes
  const antesDeExcluir = useCallback(
    ({ nodes: ns, edges: es }: { nodes: NoQuadro[]; edges: Edge[] }) => {
      const sis = ns.filter((n): n is NoSistema => n.type === 'sistema');
      const grupos = ns.length - sis.length;
      return new Promise<boolean>((ok) =>
        setConfirmacao({
          titulo: sis.length
            ? `Tirar ${sis.length === 1 ? `"${sis[0].data.nome}"` : `${sis.length} sistemas`} do quadro?`
            : grupos
            ? `Excluir ${grupos === 1 ? 'o grupo' : `${grupos} grupos`}?`
            : `Remover ${es.length === 1 ? 'a ligação' : `${es.length} ligações`}?`,
          mensagem: sis.length
            ? 'As ligações dele saem junto; o cadastro do sistema não é apagado. Só vale depois de Salvar.'
            : grupos
            ? 'Só o quadrado sai; os sistemas que estão dentro continuam no quadro. Só vale depois de Salvar.'
            : 'O sistema deixa de abrir o repositório do outro nas conversas. Só vale depois de Salvar.',
          ok,
        }),
      );
    },
    [],
  );

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const posicoes = Object.fromEntries(
        nodes.filter((n) => n.type === 'sistema').map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]),
      );
      const grupos = nodes
        .filter((n): n is NoGrupo => n.type === 'grupo')
        .map((n) => ({
          id: n.id,
          titulo: n.data.titulo,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
          w: Math.round(n.width ?? n.measured?.width ?? 400),
          h: Math.round(n.height ?? n.measured?.height ?? 260),
        }));
      const ligacoes = edges.map((e) => ({ de: Number(e.source), para: Number(e.target), s: e.sourceHandle, t: e.targetHandle }));
      await chamar('PUT', '/api/ecossistema', { posicoes, ligacoes, grupos });
      setAlterado(false);
      onToast('Fluxograma gravado.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!sistemas)
    return (
      <div className="flex-1 flex items-center justify-center">
        {erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-5 h-5 animate-spin text-stone-400" />}
      </div>
    );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 bg-white dark:bg-stone-900">
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
      <div className="flex-1 min-h-0 flex gap-3">
        {!somenteLeitura && (
        <nav aria-label="Sistemas" className="w-52 shrink-0 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 py-2">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Componentes</div>
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME, GRUPO);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => adicionarGrupo()}
            title="Quadrado para identificar um grupo de sistemas. Arraste até o quadro (ou clique para incluir no centro)."
            className="w-full flex items-center gap-2 px-3 py-1.5 mb-2 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-grab"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-md border-2 border-dashed border-stone-400 shrink-0">
              <Square className="w-3 h-3 text-stone-500" />
            </span>
            <span className="truncate">Grupo</span>
          </button>
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Fora do quadro</div>
          {foraDoQuadro.map((s) => (
            <button
              key={s.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MIME, String(s.id));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => adicionar(s)}
              title={`${s.repo}. Arraste até o quadro (ou clique para incluir no centro).`}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-grab"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/50 shrink-0">
                <Boxes className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </span>
              <span className="truncate">{s.nome}</span>
            </button>
          ))}
          {!foraDoQuadro.length && <p className={`px-3 ${HINT_CLASS}`}>Todos os sistemas já estão no quadro.</p>}
        </nav>
        )}

        <div ref={quadroRef} className="flex-1 min-w-0 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={TIPOS_RF}
            edgeTypes={TIPOS_LIGACAO}
            onNodesChange={(ch) => {
              onNodesChange(ch);
              // Mexeu de verdade: soltou depois de arrastar, terminou de redimensionar ou trocou o nome do grupo
              if (ch.some((c) => (c.type === 'position' && c.dragging === false) || (c.type === 'dimensions' && c.resizing === false) || c.type === 'replace')) {
                setAlterado(true);
              }
            }}
            nodesDraggable={!somenteLeitura}
            nodesConnectable={!somenteLeitura}
            elementsSelectable={!somenteLeitura}
            onNodeDragStart={iniciarArrasteGrupo}
            onNodeDrag={arrastarGrupo}
            elevateNodesOnSelect={false}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            connectionMode={ConnectionMode.Loose}
            isValidConnection={(c) => c.source !== c.target}
            onBeforeDelete={async (els) => {
              const ok = await antesDeExcluir(els);
              if (ok) setAlterado(true);
              return ok;
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              if (somenteLeitura) return;
              if (e.dataTransfer.getData(MIME) === GRUPO) {
                e.preventDefault();
                adicionarGrupo(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
                return;
              }
              const s = sistemas.find((x) => String(x.id) === e.dataTransfer.getData(MIME));
              if (!s || noQuadro.has(String(s.id))) return;
              e.preventDefault();
              adicionar(s, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            }}
            deleteKeyCode={somenteLeitura ? null : ['Delete', 'Backspace']}
            colorMode={escuro ? 'dark' : 'light'}
            minZoom={0.2}
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden md:!block" />
          </ReactFlow>
        </div>
      </div>

      {somenteLeitura ? (
        <p className={`${HINT_CLASS} shrink-0`}>Sistemas ligados: nas conversas de um, o repositório do outro abre junto. Só o administrador altera o quadro.</p>
      ) : (
      <div className="flex items-center gap-3 shrink-0">
        <p className={`${HINT_CLASS} flex-1`}>
          Arraste de uma das bolinhas azuis de um sistema até uma bolinha de outro para ligar: nas conversas de um, o repositório do outro abre junto. Clique numa
          ligação ou num sistema e tecle Delete para tirar. Nada muda nas conversas até Salvar.
        </p>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 shrink-0 ${
            alterado ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
          }`}
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {alterado ? 'Salvar' : 'Salvo'}
        </button>
      </div>
      )}

      {confirmacao && (
        <ConfirmDialog
          titulo={confirmacao.titulo}
          mensagem={confirmacao.mensagem}
          confirmar="Tirar"
          onConfirmar={() => {
            confirmacao.ok(true);
            setConfirmacao(null);
          }}
          onCancelar={() => {
            confirmacao.ok(false);
            setConfirmacao(null);
          }}
        />
      )}
    </div>
  );
};

/** Cadastros › Fluxograma: quadro gráfico das ligações entre os sistemas */
export const EcossistemaView: React.FC<{ onToast: (msg: string) => void; somenteLeitura?: boolean }> = ({ onToast, somenteLeitura = false }) => (
  <ReactFlowProvider>
    <SomenteLeitura.Provider value={somenteLeitura}>
      <Editor onToast={onToast} somenteLeitura={somenteLeitura} />
    </SomenteLeitura.Provider>
  </ReactFlowProvider>
);
