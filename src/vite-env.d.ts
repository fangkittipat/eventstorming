/// <reference types="vite/client" />

declare module "*.storm?raw" {
  const source: string;
  export default source;
}
