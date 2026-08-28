import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import LandingPage from "./pages/LandingPage";
import LedgerPage from "./pages/LedgerPage";
import MonitorPage from "./pages/MonitorPage";
import ShipmentManagePage from "./pages/ShipmentManagePage";
import ShipmentPage from "./pages/ShipmentPage";
import AccountPage from "./pages/AccountPage";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<LandingPage />} />
            <Route path="monitor" element={<MonitorPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="shipment" element={<ShipmentPage />} />
            <Route path="shipment/manage" element={<ShipmentManagePage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/shipment" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
