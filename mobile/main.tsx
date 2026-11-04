import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import Workspace from "../src/app/workspace";
import { seedSharedStudy } from "./shared-study";
import { mergeStudyPackage } from "./merge-package";
import { createPhoneStore, phoneApi } from "./store";
import { importStudyPackage, exportStudyPackage } from "./package";
import "../src/app/globals.css";
const db = createPhoneStore();
window.casebookTransport = phoneApi(db);
window.casebookRepairLibrary = () => seedSharedStudy(db, true);
window.casebookCheckUpdate = async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.update()));
};
window.casebookMergePackage = (file) => mergeStudyPackage(db, file);
window.casebookImportPackage = (file) => importStudyPackage(db, file);
window.casebookExportPackage = () => exportStudyPackage(db);
const applyUpdate = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && navigator.onLine)
          registration.update().catch(() => {});
      });
  },
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
