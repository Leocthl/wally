// BoothProvider seals the ready-made budget itself when nothing is sealed (docs/06), unless it is told to wait: the first
// run holds that seal back so a new visitor can set up their own budget, and seals it when they skip.
import { FakeClock } from "@wally/core/testing";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import type { BoothSnapshot } from "../src/api/types";
import { m0Request } from "../src/booth/compile";
import { BoothProvider, useBoothContext } from "../src/hooks/useBooth";

function Probe(): React.ReactElement {
  const { info, state } = useBoothContext();
  return <p data-testid="probe">{info === null ? "loading" : state.mandate === null ? "no budget" : "budget"}</p>;
}

const client = (): MockApiClient => new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });

describe("BoothProvider autoSeal", () => {
  it("seals the ready-made budget on load by default", async () => {
    const api = client();
    render(<BoothProvider api={api}><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("budget"));
    expect((await api.snapshot()).mandate).not.toBeNull();
  });

  it("leaves the booth empty while autoSeal is off, and still loads the booth's info", async () => {
    const api = client();
    render(<BoothProvider api={api} autoSeal={false}><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("no budget"));
    expect((await api.snapshot()).mandate).toBeNull();
  });

  it("shows a budget the booth already holds, with autoSeal on or off", async () => {
    const api = client();
    await api.seal((await import("../src/booth/compile")).m0Request(new Date()));
    render(<BoothProvider api={api} autoSeal={false}><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(/^budget$/));
  });

  it("seals the ready-made budget when autoSeal turns on after the booth loaded with none", async () => {
    const api = client();
    const { rerender } = render(<BoothProvider api={api} autoSeal={false}><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("no budget"));
    rerender(<BoothProvider api={api} autoSeal><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(/^budget$/));
    expect((await api.snapshot()).mandate).not.toBeNull();
  });

  it("does not seal over a budget that arrived while it was held back (another phone sealed one)", async () => {
    const api = client();
    const seal = vi.spyOn(api, "seal");
    const { rerender } = render(<BoothProvider api={api} autoSeal={false}><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("no budget"));
    await api.seal(m0Request(new Date()));
    seal.mockClear();
    rerender(<BoothProvider api={api} autoSeal><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(/^budget$/));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seal).not.toHaveBeenCalled();
  });

  it("seals once, not twice, when autoSeal turns on while the first load is still under way", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class SlowSnapshot extends MockApiClient {
      override async snapshot(): Promise<BoothSnapshot> {
        await gate;
        return super.snapshot();
      }
    }
    const api = new SlowSnapshot({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
    const seal = vi.spyOn(api, "seal");
    const { rerender } = render(<BoothProvider api={api} autoSeal={false}><Probe /></BoothProvider>);
    rerender(<BoothProvider api={api} autoSeal><Probe /></BoothProvider>);
    release();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(/^budget$/));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seal).toHaveBeenCalledTimes(1);
  });

  it("tries the ready-made budget once: a refused seal is shown, and nothing retries by itself", async () => {
    const api = client();
    const seal = vi.spyOn(api, "seal").mockRejectedValue(new Error("refused by the test"));
    const { rerender } = render(<BoothProvider api={api} autoSeal={false}><Probe /></BoothProvider>);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("no budget"));
    rerender(<BoothProvider api={api} autoSeal><Probe /></BoothProvider>);
    await waitFor(() => expect(seal).toHaveBeenCalledTimes(1));
    rerender(<BoothProvider api={api} autoSeal><Probe /></BoothProvider>);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("probe")).toHaveTextContent("no budget");
  });
});

