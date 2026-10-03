// BoothProvider seals the ready-made budget itself when nothing is sealed (docs/06), unless it is told to wait: the first
// run holds that seal back so a new visitor can set up their own budget, and seals it when they skip.
import { FakeClock } from "@wally/core/testing";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
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
});
