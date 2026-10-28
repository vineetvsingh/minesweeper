import "./styles.css";
import { snapshot, start, type Snapshot } from "./game";

// When the page runs as a Claude artifact, keep the game across hot reloads.
interface Hot {
  snapshot?: (fn: () => unknown) => void;
  ready?: (fn: (data: { mode?: string; game?: Snapshot }) => void) => void;
  data?: { mode?: string; game?: Snapshot };
}
declare global {
  interface Window {
    claude?: { hot?: Hot };
  }
}

const hot = window.claude?.hot;
hot?.snapshot?.(snapshot);
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
