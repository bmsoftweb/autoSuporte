import crypto from 'crypto';

/**
 * Tokens gravados no banco (ex.: token do GitHub de cada sistema) cifrados com AES-256-GCM.
 * A chave sai do SESSION_SECRET: trocá-lo obriga a redigitar os tokens nos cadastros.
 */
const chave = () => crypto.createHash('sha256').update(`autosuporte:${process.env.SESSION_SECRET || ''}`).digest();

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

/** `onde` entra na mensagem de erro, ex.: "Cadastros › Sistemas" */
export function decifrar(cifrado: string, onde: string): string {
  try {
    const [iv, tag, dados] = cifrado.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
  } catch {
    throw new Error(`Não foi possível ler o token gravado (o SESSION_SECRET mudou?). Digite-o de novo em ${onde}.`);
  }
}
