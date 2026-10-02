// Booth UI skeleton. Owner: lane C (screens per docs/04). The rail is SIMULATED on every screen.
import { RAIL_BADGE } from "./labels";

export function App() {
  return (
    <main>
      <h1>Lai See Agent</h1>
      <p lang="zh-HK">利是 Agent</p>
      <p>
        Rail: <strong>{RAIL_BADGE}</strong>
      </p>
    </main>
  );
}
