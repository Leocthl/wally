// Vite `?raw` imports: the file's exact text (the demo log must stay byte-identical to the golden file).
declare module "*?raw" {
  const text: string;
  export default text;
}

// Side-effect stylesheet imports; the build inlines them into the one page (build/plugin.ts).
declare module "*.css";
