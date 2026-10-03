// Offline verifier page entry. The production build inlines this as one classic script (build/plugin.ts).
import { mountVerifier } from "./app";
import "./styles/tokens.css";
import "./styles/verifier.css";
import "./styles/verdict.css";
import "./styles/timeline.css";
import "./styles/mode.css";
import "./styles/plain.css";
import "./styles/motion.css";

const root = document.getElementById("app");
if (root !== null) mountVerifier(root);
