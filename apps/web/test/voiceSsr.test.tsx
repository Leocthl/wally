// @vitest-environment node
// A server render has no window: the voice controls must neither throw nor draw anything there.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useVoiceInput } from "../src/shell/voice/useVoiceInput";
import { VoiceButton, VoiceStatusLine } from "../src/shell/voice/VoiceButton";
import { LocaleProvider } from "../src/ui/locale";

function Probe() {
  const voice = useVoiceInput({ value: "", onText: () => undefined });
  return (
    <div>
      <VoiceButton voice={voice} />
      <VoiceStatusLine voice={voice} />
    </div>
  );
}

describe("voice input on a server render (no window)", () => {
  it("draws no mic and no status line, and does not throw", () => {
    expect(typeof window).toBe("undefined");
    expect(renderToString(<LocaleProvider locale="en"><Probe /></LocaleProvider>)).toBe("<div></div>");
  });
});
