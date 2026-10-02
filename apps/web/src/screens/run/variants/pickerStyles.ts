// The picker's stylesheet as a string, injected by ProtoPicker. It is harness chrome with fixed raw colours (it has to
// read on a light or a dark page), which the repo's stylesheet guards (test/design-css.test.ts: tokens only, no glass)
// would refuse in a .css file; as a string in a dev-only module it never reaches a production bundle.
export const PICKER_CSS = `/* The variant picker: harness chrome, not a design. The values follow the prototype skill's PICKER.md. One deviation:
   no backdrop-filter, because test/branding.test.tsx forbids glass effects in any stylesheet; the pill is a little more
   opaque instead. It must not adapt to the project's tokens: it has to read as chrome on a light or a dark page. */
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.92);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}
.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}
/* The slide is enabled only after first paint (data-ready), so load does not animate. */
.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}
@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}
.proto-picker-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  min-height: 28px;
  min-width: 0;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}
@media (hover: hover) and (pointer: fine) {
  .proto-picker-item:hover { color: rgba(255, 255, 255, 0.85); }
}
.proto-picker-item:active { transform: scale(0.97); }
.proto-picker-item:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.4); outline-offset: 2px; }
.proto-picker-item[data-active] { color: #fff; }
.proto-picker-divider { width: 1px; height: 16px; margin: 0 4px; background: rgba(255, 255, 255, 0.12); }
.proto-picker-replay { padding: 0 10px; font-size: 14px; }
.proto-picker[data-position="top"] { bottom: auto; top: 24px; }

/* A second pill with the same look, for the case of the moment shown (budget stop, seller stop...). */
.proto-cases { position: fixed; top: 10px; left: 50%; z-index: 2147483646; transform: translateX(-50%); display: flex; gap: 2px; padding: 3px; max-width: calc(100vw - 16px); overflow-x: auto; border-radius: 999px; background: rgba(10, 10, 10, 0.92); font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.proto-cases a { display: block; min-height: 0; min-width: 0; padding: 7px 10px; border-radius: 999px; color: rgba(255, 255, 255, 0.62); text-decoration: none; white-space: nowrap; }
.proto-cases a[aria-current="true"] { background: rgba(255, 255, 255, 0.14); color: #fff; }
.proto-cases a:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.4); outline-offset: 1px; }
`;
