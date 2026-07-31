import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* base must match the GitHub Pages sub-path, i.e. /<repo-name>/.
   Set once here; the deploy workflow passes the repo name in automatically. */
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    // Assets stay as real files (models, audio, textures) rather than being
    // inlined — the whole point of moving off the single-file build.
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
