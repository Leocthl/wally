// Offline verifier page entry. The production build inlines this as one classic script (build/plugin.ts).
import { mountVerifier } from "./app";
import "./styles/tokens.css";
import "./styles/verifier.css";

const root = document.getElementById("app");
if (root !== null) mountVerifier(root);
