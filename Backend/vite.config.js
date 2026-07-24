import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // index.html lives one level up, in palm-reading/
  root: path.resolve(__dirname, '..'),
  // .env lives right here, in palm-reading/backend/
  envDir: __dirname,
  build: {
    // send the built output back up to palm-reading/dist
    outDir: path.resolve(__dirname, '../dist'),
    emptyOutDir: true
  }
});