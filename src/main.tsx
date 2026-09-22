import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Only in a build: in dev a worker would answer with the last bundle it cached
// instead of the one Vite is serving. The path is relative to the document, so
// the scope follows the app wherever it is deployed. Offline play is a bonus,
// and a registration the browser refuses must not take the game down with it.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
