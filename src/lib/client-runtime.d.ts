export {};
declare global {
  interface Window {
    casebookUpdateAvailable?: boolean;
    casebookApplyUpdate?: () => Promise<void>;
    casebookTransport?: (path: string, body?: any) => Promise<any>;
    casebookImportPackage?: (
      file: File,
    ) => Promise<{ courses: number; modules: number; sources: number }>;
    casebookMergePackage?: (
      file: File,
    ) => Promise<{
      added: number;
      filled: number;
      kept: number;
      sources: number;
    }>;
    casebookExportPackage?: () => Promise<Blob>;
  }
}
