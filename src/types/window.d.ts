export {};

declare global {
  interface Window {
    __SW_DEBUG?: {
      attempts: number;
      lastError: string | null;
      status: string;
    };
  }
}
