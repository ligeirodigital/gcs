import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import Admin from "./pages/Admin.tsx";
import Projects from "./pages/Projects.tsx";
import ProjectDetail from "./pages/ProjectDetail.tsx";
import { lazy, Suspense } from "react";
import NotFound from "./pages/NotFound.tsx";
import "./index.css";

const PublicGc = lazy(() => import("./gc/pages/PublicGc.tsx"));
const Privacy = lazy(() => import("./gc/pages/Privacy.tsx"));
const GcApp = lazy(() => import("./gc/GcApp.tsx"));

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/projetos" element={<Projects />} />
          <Route path="/projetos/:slug" element={<ProjectDetail />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/gc/:slug" element={<Suspense fallback={null}><PublicGc /></Suspense>} />
          <Route path="/privacidade" element={<Suspense fallback={null}><Privacy /></Suspense>} />
          <Route path="/app/*" element={<Suspense fallback={null}><GcApp /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </HelmetProvider>
);
