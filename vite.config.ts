import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Repo name on GitHub is `rfc17-simulator`, so the deployed Pages URL is
// https://<user>.github.io/rfc17-simulator/. Vite needs that path as `base`
// so emitted asset URLs resolve correctly when served from the subpath.
export default defineConfig({
  plugins: [react()],
  base: "/rfc17-simulator/",
  server: { port: 5173, host: "localhost" },
});
