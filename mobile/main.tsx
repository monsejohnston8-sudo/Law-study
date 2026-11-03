import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import Workspace from "../src/app/workspace";
import { createPhoneStore, phoneApi } from "./store";
import { importStudyPackage, exportStudyPackage } from "./package";
import "../src/app/globals.css";
const db = createPhoneStore();
window.casebookTransport = phoneApi(db);
window.casebookImportPackage = (file) => importStudyPackage(db, file);
window.casebookExportPackage = () => exportStudyPackage(db);
const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.casebookUpdateAvailable = true;
    window.dispatchEvent(new Event("casebook-update-ready"));
  },
});
window.casebookApplyUpdate = () => applyUpdate(true);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Workspace />
  </React.StrictMode>,
);
