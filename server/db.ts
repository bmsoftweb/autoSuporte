import 'dotenv/config';
import mysql from 'mysql2/promise';

// Credenciais só pelo ambiente (.env): nunca no código, que vai para o GitHub
for (const nome of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
  if (!process.env[nome]) throw new Error(`${nome} não definido no .env.`);
}

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'autosuporte',
  connectionLimit: 10,
  connectTimeout: 20000,
  dateStrings: true,
});

// Horário de Brasília: NOW() e DEFAULT CURRENT_TIMESTAMP em UTC-3, qualquer que seja o fuso do servidor
pool.pool.on('connection', (conn: any) => {
  conn.query("SET time_zone = '-03:00'");
});
