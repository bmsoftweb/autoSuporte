/**
 * Sessão e opção "Lembrar neste dispositivo" (mesmo esquema do crmWeb).
 *
 * - Marcada: a sessão fica no localStorage (sobrevive ao fechar o navegador) e o
 *   e-mail e a senha ficam guardados para vir preenchidos no próximo login.
 * - Desmarcada: a sessão fica no sessionStorage (termina ao fechar o navegador).
 */

const SESSAO = 'autosuporte_sessao';
const LEMBRETE = 'autosuporte_lembrar';

export interface Usuario {
  nome: string;
  email: string;
  /** admin = mantém os cadastros; cliente = só tira dúvidas */
  tipo?: 'admin' | 'cliente';
}

export interface Sessao {
  usuario: Usuario;
  token: string;
}

/** O acesso ao storage pode lançar exceção (modo privado, bloqueio de cookies) */
function seguro<T>(fn: () => T, padrao: T): T {
  try {
    return fn();
  } catch {
    return padrao;
  }
}

export function lerSessao(): Sessao | null {
  return seguro(() => {
    const bruto = localStorage.getItem(SESSAO) ?? sessionStorage.getItem(SESSAO);
    const s = bruto ? (JSON.parse(bruto) as Sessao) : null;
    return s?.token && s.usuario ? s : null;
  }, null);
}

export function salvarSessao(sessao: Sessao, lembrar: boolean) {
  seguro(() => {
    (lembrar ? localStorage : sessionStorage).setItem(SESSAO, JSON.stringify(sessao));
    (lembrar ? sessionStorage : localStorage).removeItem(SESSAO);
  }, undefined);
}

export function limparSessao() {
  seguro(() => {
    localStorage.removeItem(SESSAO);
    sessionStorage.removeItem(SESSAO);
  }, undefined);
}

/**
 * ATENÇÃO: com "Lembrar" marcado, a senha fica no localStorage deste navegador. O base64
 * só evita que ela apareça legível de relance; NÃO é criptografia.
 */
export interface Lembrete {
  email: string;
  senha: string;
}

export function lerLembrete(): Lembrete | null {
  return seguro(() => {
    const bruto = localStorage.getItem(LEMBRETE);
    if (!bruto) return null;
    const l = JSON.parse(bruto) as { email?: string; senha?: string };
    return { email: String(l.email || ''), senha: l.senha ? decodeURIComponent(escape(atob(l.senha))) : '' };
  }, null);
}

export function salvarLembrete(email: string, senha: string) {
  seguro(
    () => localStorage.setItem(LEMBRETE, JSON.stringify({ email, senha: senha ? btoa(unescape(encodeURIComponent(senha))) : '' })),
    undefined,
  );
}

export function limparLembrete() {
  seguro(() => localStorage.removeItem(LEMBRETE), undefined);
}
