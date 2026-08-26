import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import MonitorPage from "./pages/MonitorPage";
import LedgerPage from "./pages/LedgerPage";
import ShipmentPage from "./pages/ShipmentPage";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/shipment" replace />} />
          <Route path="monitor" element={<MonitorPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="shipment" element={<ShipmentPage />} />
          <Route path="*" element={<Navigate to="/shipment" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
