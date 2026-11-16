import * as React from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";
import { AuthProvider } from "@/auth/auth-context";
import { Toaster } from "@/components/ui/sonner";
import "@/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Missing application root element");

createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <Toaster />
    </AuthProvider>
  </React.StrictMode>,
);
