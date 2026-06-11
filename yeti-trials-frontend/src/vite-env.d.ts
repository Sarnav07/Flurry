/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ORCHESTRATOR_URL: string;
  readonly VITE_SUI_NETWORK: string;
  readonly VITE_SUI_RPC_URL: string;
  readonly VITE_ENABLE_3D: string;
  readonly VITE_ENABLE_POST_FX: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_ENABLE_ZKLOGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
