/// <reference types="vite/client" />

/**
 * The probe's own address, e.g. `http://10.0.0.8`.
 *
 * Optional. Unset, the console runs exactly as before and the acknowledge
 * control is not offered — there is no buzzer within reach to pause.
 */
interface ImportMetaEnv {
  readonly VITE_VAULT_DEVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
