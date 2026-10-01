/**
 * Caminho em ângulo reto entre dois pontos que contorna retângulos (os quadros do Ecossistema).
 * A* numa grade de CELULA px; virar custa mais que andar, para sair poucas curvas.
 * Devolve null quando a área é grande demais (quem chama usa a linha comum).
 */

export interface Ponto {
  x: number;
  y: number;
}
export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CELULA = 10;
const FOLGA = 12; // distância mínima da linha até um quadro
const CUSTO_CURVA = 6;
const MAX_CELULAS = 120_000; // ponytail: grade fixa; com centenas de quadros, trocar por roteador de grafo de visibilidade
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** dirInicial: índice em DIRS para a primeira perna (sair reto do ponto de contato) */
export function rotaDesvio(a: Ponto, b: Ponto, obstaculos: Retangulo[], dirInicial = -1): Ponto[] | null {
  const xs = [a.x, b.x, ...obstaculos.flatMap((r) => [r.x, r.x + r.w])];
  const ys = [a.y, b.y, ...obstaculos.flatMap((r) => [r.y, r.y + r.h])];
  // Grade alinhada ao ponto de partida: a primeira perna sai exatamente dele
  const minX = a.x - CELULA * Math.ceil((a.x - Math.min(...xs) + 60) / CELULA);
  const minY = a.y - CELULA * Math.ceil((a.y - Math.min(...ys) + 60) / CELULA);
  const cols = Math.ceil((Math.max(...xs) + 60 - minX) / CELULA) + 1;
  const lins = Math.ceil((Math.max(...ys) + 60 - minY) / CELULA) + 1;
  if (cols * lins > MAX_CELULAS) return null;

  const bloq = new Uint8Array(cols * lins);
  for (const r of obstaculos) {
    const c0 = Math.max(0, Math.floor((r.x - FOLGA - minX) / CELULA));
    const c1 = Math.min(cols - 1, Math.ceil((r.x + r.w + FOLGA - minX) / CELULA));
    const l0 = Math.max(0, Math.floor((r.y - FOLGA - minY) / CELULA));
    const l1 = Math.min(lins - 1, Math.ceil((r.y + r.h + FOLGA - minY) / CELULA));
    for (let l = l0; l <= l1; l++) bloq.fill(1, l * cols + c0, l * cols + c1 + 1);
  }

  const cel = (p: Ponto) => [Math.round((p.x - minX) / CELULA), Math.round((p.y - minY) / CELULA)];
  const [ac, al] = cel(a);
  const [bc, bl] = cel(b);
  const ini = al * cols + ac;
  const fim = bl * cols + bc;
  // Início e fim ficam livres mesmo encostados num quadro (são as pontas que saem dos pontos de contato)
  bloq[ini] = 0;
  bloq[fim] = 0;

  const n = cols * lins * 4;
  const g = new Float64Array(n).fill(Infinity);
  const ant = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];
  const empurra = (f: number, s: number) => {
    heap.push([f, s]);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const tira = () => {
    const topo = heap[0];
    const ult = heap.pop()!;
    if (heap.length) {
      heap[0] = ult;
      for (let i = 0; ; ) {
        const e = 2 * i + 1;
        const d = e + 1;
        let m = i;
        if (e < heap.length && heap[e][0] < heap[m][0]) m = e;
        if (d < heap.length && heap[d][0] < heap[m][0]) m = d;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return topo;
  };
  const h = (c: number) => Math.abs((c % cols) - bc) + Math.abs(Math.floor(c / cols) - bl);

  for (let d = 0; d < 4; d++) {
    if (dirInicial >= 0 && d !== dirInicial) continue;
    g[ini * 4 + d] = 0;
    empurra(h(ini), ini * 4 + d);
  }

  let achou = -1;
  while (heap.length) {
    const [, s] = tira();
    const c = s >> 2;
    const d = s & 3;
    if (c === fim) {
      achou = s;
      break;
    }
    const x = c % cols;
    const y = Math.floor(c / cols);
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DIRS[nd][0];
      const ny = y + DIRS[nd][1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= lins) continue;
      const nc = ny * cols + nx;
      if (bloq[nc]) continue;
      const ns = nc * 4 + nd;
      const custo = g[s] + 1 + (nd !== d ? CUSTO_CURVA : 0);
      if (custo < g[ns]) {
        g[ns] = custo;
        ant[ns] = s;
        empurra(custo + h(nc), ns);
      }
    }
  }
  if (achou < 0) return null;

  // Volta pelo caminho guardando só as curvas
  const pts: Ponto[] = [];
  for (let s = achou; s >= 0; s = ant[s]) {
    const c = s >> 2;
    pts.push({ x: minX + (c % cols) * CELULA, y: minY + Math.floor(c / cols) * CELULA });
  }
  pts.reverse();
  // Ponta final exata (a grade pode estar até meia célula fora): arrasta a última perna até ela
  const k = pts.length - 1;
  if (k >= 1 && pts[k - 1].x === pts[k].x) pts[k - 1] = { ...pts[k - 1], x: b.x };
  else if (k >= 1) pts[k - 1] = { ...pts[k - 1], y: b.y };
  pts[k] = { ...b };
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a0 = pts[i - 1];
    const a1 = pts[i + 1];
    return !((a0.x === p.x && p.x === a1.x) || (a0.y === p.y && p.y === a1.y));
  });
}

/** Caminho SVG pelos pontos, com cantos levemente arredondados */
export function caminhoSvg(pts: Ponto[], raio = 6): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p0, p, p1] = [pts[i - 1], pts[i], pts[i + 1]];
    const r = Math.min(raio, Math.hypot(p.x - p0.x, p.y - p0.y) / 2, Math.hypot(p1.x - p.x, p1.y - p.y) / 2);
    const ux = Math.sign(p.x - p0.x);
    const uy = Math.sign(p.y - p0.y);
    const vx = Math.sign(p1.x - p.x);
    const vy = Math.sign(p1.y - p.y);
    d += ` L ${p.x - ux * r} ${p.y - uy * r} Q ${p.x} ${p.y} ${p.x + vx * r} ${p.y + vy * r}`;
  }
  const u = pts[pts.length - 1];
  return `${d} L ${u.x} ${u.y}`;
}
