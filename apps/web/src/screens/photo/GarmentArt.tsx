// One garment as a flat illustration. The shapes come from garmentParts (the same data garmentSvg serialises), so the
// component and the string cannot drift. Decorative unless given a label; the parent sets `color` and the background.
import { useMemo, type ReactElement } from "react";
import type { Color, Kind, Pattern } from "@wally/agent/vision";
import { garmentParts, VIEW_BOX, type GarmentNode } from "./garments";

export interface GarmentArtProps {
  readonly kind: Kind;
  readonly colors: readonly Color[];
  readonly pattern?: Pattern;
  /** Pixels, default 96. */
  readonly size?: number;
  readonly className?: string;
  /** When given: role="img" and aria-label. When omitted the picture is decorative (aria-hidden). */
  readonly label?: string;
}

function renderNode(part: GarmentNode, key: number): ReactElement {
  const children = part.children.map((child, i) => renderNode(child, i));
  switch (part.tag) {
    case "g":
      return (
        <g key={key} {...part.attrs}>
          {children}
        </g>
      );
    case "path":
      return <path key={key} {...part.attrs} />;
    case "circle":
      return <circle key={key} {...part.attrs} />;
    case "rect":
      return <rect key={key} {...part.attrs} />;
  }
}

export function GarmentArt({ kind, colors, pattern = "plain", size = 96, className, label }: GarmentArtProps): ReactElement {
  const list = Array.isArray(colors) ? colors : [];
  const colorKey = list.join(",");
  const parts = useMemo(() => garmentParts({ kind, colors: list, pattern }), [kind, colorKey, pattern]);
  const named = label !== undefined && label.trim() !== "";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      className={className}
      role={named ? "img" : undefined}
      aria-label={named ? label : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
    >
      {parts.map((part, i) => renderNode(part, i))}
    </svg>
  );
}
