import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Versão do package.json na tela (rodapé do login)
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync('package.json', 'utf-8')).version),
  },
  // Porta de HMR própria, para rodar junto com o crmWeb (24679) e o portal (24678)
  server: { hmr: { port: 24680 } },
});
