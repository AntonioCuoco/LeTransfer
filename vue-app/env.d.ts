/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// PrimeVue ships this internal module without type declarations.
declare module 'primevue/toasteventbus' {
  interface ToastEventBus {
    emit(event: string, payload?: unknown): void
    on(event: string, callback: (payload?: unknown) => void): void
    off(event: string, callback: (payload?: unknown) => void): void
  }
  const bus: ToastEventBus
  export default bus
}
