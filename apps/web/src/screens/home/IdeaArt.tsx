// A plain drawing of each idea for the preview sheet: flat shapes in the app's own colours (tokens, so dark mode follows), no
// brand, no text, no photo. A placeholder in the best sense: it says what kind of thing the shop is offering, and it is the one
// place to swap in the photo lane's shop art when that lands (the sheet only asks for <IdeaArt id size />).
import type { ReactElement } from "react";
import type { IdeaId } from "./ideas";
import "./ideaSheet.css";

/** A t-shirt body with its two short sleeves, as one outline (the graphic tee shares it). */
const TEE = "M44 17 L28 23 L8 43 L21 56 L32 47 L32 101 Q32 105 36 105 L84 105 Q88 105 88 101 L88 47 L99 56 L112 43 L92 23 L76 17 Q60 36 44 17 Z";
const COLLAR = "M44 17 Q60 37 76 17";

function Tee(): ReactElement {
  return (
    <>
      <path className="ia-main ia-edge" d={TEE} />
      <path className="ia-line ia-heavy" d={COLLAR} />
      <path className="ia-line" d="M21 56 L32 47 M99 56 L88 47 M36 98 H84" />
    </>
  );
}

function GraphicTee(): ReactElement {
  return (
    <>
      <path className="ia-main ia-edge" d={TEE} />
      <path className="ia-line ia-heavy" d={COLLAR} />
      <path className="ia-line" d="M21 56 L32 47 M99 56 L88 47 M36 98 H84" />
      <circle className="ia-accent" cx="60" cy="63" r="14" />
      <path className="ia-light" d="M60 53 L63 60 L70 61 L65 66 L66 73 L60 69 L54 73 L55 66 L50 61 L57 60 Z" />
    </>
  );
}

function Socks(): ReactElement {
  const sock = "M26 16 H52 V58 Q52 62 56 63 L86 72 Q98 76 98 86 V88 Q98 94 92 94 H38 Q26 94 26 82 Z";
  return (
    <>
      <g transform="translate(14 -10) scale(0.9)" opacity="0.6">
        <path className="ia-main ia-edge" d={sock} />
        <rect className="ia-accent" x="26" y="16" width="26" height="12" />
      </g>
      <path className="ia-main ia-edge" d={sock} />
      <rect className="ia-accent" x="26" y="16" width="26" height="12" />
      <path className="ia-line" d="M26 34 H52 M26 40 H52" />
      <path className="ia-shade" d="M26 72 Q26 94 40 94 L42 84 Q32 84 32 72 Z M84 71 Q98 76 98 86 V88 Q98 94 92 94 H86 Z" />
    </>
  );
}

function Jacket(): ReactElement {
  return (
    <>
      <path className="ia-main ia-edge" d="M40 20 L80 20 L88 28 L88 104 L32 104 L32 28 Z" />
      <path className="ia-main ia-edge" d="M32 28 L16 36 L10 98 L24 100 L32 64 Z M88 28 L104 36 L110 98 L96 100 L88 64 Z" />
      <path className="ia-shade ia-edge" d="M42 18 L60 38 L49 42 L37 26 Z M78 18 L60 38 L71 42 L83 26 Z" />
      <path className="ia-line ia-stitch" d="M60 38 V104 M38 50 H52 V63 H38 Z M68 50 H82 V63 H68 Z M32 96 H88" />
      <circle className="ia-light" cx="60" cy="52" r="2.2" />
      <circle className="ia-light" cx="60" cy="68" r="2.2" />
      <circle className="ia-light" cx="60" cy="84" r="2.2" />
    </>
  );
}

function Hoodie(): ReactElement {
  return (
    <>
      <path className="ia-shade ia-edge" d="M40 22 Q40 6 60 6 Q80 6 80 22 L80 34 L40 34 Z" />
      <path className="ia-main ia-edge" d="M42 20 L28 26 L12 50 L14 100 L28 102 L32 66 L32 104 L88 104 L88 66 L92 102 L106 100 L108 50 L92 26 L78 20 Q60 40 42 20 Z" />
      <path className="ia-line ia-heavy" d="M42 20 Q60 40 78 20" />
      <path className="ia-line ia-stitch" d="M52 36 V54 M68 36 V54 M40 76 H80 L84 100 H36 Z M32 98 H88" />
      <circle className="ia-light" cx="52" cy="56" r="2" />
      <circle className="ia-light" cx="68" cy="56" r="2" />
    </>
  );
}

function Earbuds(): ReactElement {
  return (
    <>
      <rect className="ia-case ia-edge" x="18" y="52" width="84" height="48" rx="16" />
      <path className="ia-line ia-light-line" d="M18 72 H102" />
      <circle className="ia-accent" cx="60" cy="86" r="3.5" />
      <g transform="translate(34 14)">
        <rect className="ia-main ia-edge" x="0" y="0" width="14" height="22" rx="7" />
        <rect className="ia-main ia-edge" x="3" y="18" width="8" height="22" rx="4" />
      </g>
      <g transform="translate(72 14)">
        <rect className="ia-main ia-edge" x="0" y="0" width="14" height="22" rx="7" />
        <rect className="ia-main ia-edge" x="3" y="18" width="8" height="22" rx="4" />
      </g>
    </>
  );
}

const DRAWING: Readonly<Record<IdeaId, () => ReactElement>> = { tee: Tee, socks: Socks, jacket: Jacket, hoodie: Hoodie, graphic: GraphicTee, earbuds: Earbuds };

export interface IdeaArtProps {
  readonly id: IdeaId;
  /** Side of the square, in pixels. */
  readonly size?: number;
  readonly className?: string;
}

/** The drawing of one idea. Decorative: the sheet beside it says what it is. */
export function IdeaArt({ id, size = 128, className }: IdeaArtProps): ReactElement {
  const Drawing = DRAWING[id];
  return (
    <svg className={className === undefined ? "idea-art" : `idea-art ${className}`} data-art={id} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false">
      <circle className="ia-glow" cx="60" cy="62" r="52" />
      <Drawing />
    </svg>
  );
}
