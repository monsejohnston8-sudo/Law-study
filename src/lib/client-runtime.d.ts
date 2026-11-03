export {};
declare global {
  interface Window {
    casebookUpdateAvailable?: boolean;
    casebookApplyUpdate?: () => Promise<void>;
    casebookTransport?: (path: string, body?: any) => Promise<any>;
    casebookImportPackage?: (
      file: File,
    ) => Promise<{ courses: number; modules: number; sources: number }>;
    casebookExportPackage?: () => Promise<Blob>;
  }
}
