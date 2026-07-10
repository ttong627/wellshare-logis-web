/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_ECOUNT_GATEWAY_URL?: string;
  readonly VITE_ADDRESS_MATCH_API_URL?: string;
  readonly VITE_REFINE_SYSTEM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 빌드 시 vite define으로 주입되는 앱 버전(package.json version)
declare const __APP_VERSION__: string;
