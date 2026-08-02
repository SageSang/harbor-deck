import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        newtab: path.resolve(__dirname, 'newtab.html'),
        options: path.resolve(__dirname, 'options.html'),
        popup: path.resolve(__dirname, 'popup.html'),
        background: path.resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames(chunkInfo) {
          return chunkInfo.name === 'background' ? 'background.js' : 'assets/[name].js'
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@extension': path.resolve(__dirname, './src'),
    },
  },
})
