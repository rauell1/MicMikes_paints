import { Component, StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import AdminApp from "./AdminApp";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif", background:"#F8F4EF" }}>
        <div style={{ textAlign:"center", padding:"2rem" }}>
          <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>🎨</div>
          <h2 style={{ fontSize:"1.25rem", fontWeight:700, marginBottom:".5rem", color:"#2B2B2E" }}>Something went wrong</h2>
          <p style={{ color:"#6f6a62", marginBottom:"1.5rem", fontSize:".9rem" }}>Please refresh the page to continue.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background:"#B84A32", color:"#fff", border:"none", borderRadius:"999px", padding:".75rem 1.75rem", fontWeight:600, fontSize:".9rem", cursor:"pointer" }}
          >
            Refresh page
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

const isAdmin = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isAdmin ? <AdminApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>
);
