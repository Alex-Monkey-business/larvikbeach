import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Hvert bygg får en id. Den bakes inn i appen OG skrives til /version.json,
// så en app som alt er åpen kan se at det finnes en nyere versjon og laste
// seg inn på nytt (src/lib/useFreshApp.ts). Uten dette kjørte hjemskjerm-appen
// gammel kode til noen sveipet den bort.
const buildId = new Date().toISOString()

const versionJson: Plugin = {
  name: 'version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: buildId }) })
  },
}

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), versionJson],
})
