// Dev-only: #/styleguide/variants/run lists the moments; #/styleguide/variants/run/<moment>?v=2&c=<case> shows one
// variant at full size on the real page. Keys 1 to N and the arrows flip, R replays. Never part of a production build:
// StyleGuideRoute reaches this file only behind import.meta.env.DEV.
import { useCallback, useState, useSyncExternalStore, type ReactElement } from "react";
import { LocaleProvider } from "../../../ui/locale";
import { ToastProvider } from "../../../ui/Toast";
import { Skeleton } from "../../../ui/Surface";
import { WhySheet } from "../components/WhySheet";
import { logSeqOf } from "../model/chain";
import { MOMENTS, type MomentDef } from "./moments";
import { ProtoPicker } from "./ProtoPicker";
import { Stage } from "./Stage";
import { useMockState } from "./useMockState";
import "../../../design/ui/run-extra.css";
import "../run-card.css";
import "../run-ok.css";
import "../run-stop.css";
import "./card.css";
import "./ok.css";
import "./stopped.css";
import "../run.css";

const ROOT = /^#\/?styleguide\/variants\/run(?:\/([a-z]+))?(?:\?(.*))?$/;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = (): string => window.location.hash;

interface Where {
  readonly moment: string | null;
  readonly query: URLSearchParams;
}

function where(hash: string): Where {
  const m = ROOT.exec(hash);
  return { moment: m?.[1] ?? null, query: new URLSearchParams(m?.[2] ?? "") };
}

/** Changes one query key in place (no history entry) and tells the hash subscribers. */
function setQuery(key: string, value: string): void {
  const w = where(window.location.hash);
  w.query.set(key, value);
  window.history.replaceState(window.history.state, "", `#/styleguide/variants/run/${w.moment ?? ""}?${w.query.toString()}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function Index(): ReactElement {
  return (
    <main className="shell-main" style={{ maxWidth: "30rem", margin: "0 auto" }}>
      <h1>Wally screens: variants</h1>
      <p>Dev only. Each moment has three genuinely different layouts to flip through.</p>
      <ul>
        {MOMENTS.map((m) => (
          <li key={m.id}><a href={`#/styleguide/variants/run/${m.id}?v=1`}>{m.title}</a>: {m.brief}</li>
        ))}
      </ul>
    </main>
  );
}

function Moment({ moment, query }: { readonly moment: MomentDef; readonly query: URLSearchParams }): ReactElement {
  const index = Math.min(moment.variants.length, Math.max(1, Number.parseInt(query.get("v") ?? "1", 10) || 1)) - 1;
  const current = moment.cases.find((c) => c.id === query.get("c")) ?? moment.cases[0];
  const [replay, setReplay] = useState(0);
  const [why, setWhy] = useState(false);
  const play = useMockState(current?.scenarios ?? [], replay);
  const variant = moment.variants[index];
  const select = useCallback((i: number) => setQuery("v", String(i + 1)), []);
  const again = useCallback(() => setReplay((n) => n + 1), []);
  const result = play?.result ?? null;
  return (
    <>
      <Stage>
        {result && variant ? (
          <div key={`${index}-${replay}-${current?.id ?? ""}`}>{variant.render({ result, packet: play?.state.packet ?? null, onWhy: () => setWhy(true) })}</div>
        ) : (
          <Skeleton height="12rem" radius="md" />
        )}
      </Stage>
      {result?.chain && play ? <WhySheet open={why} onClose={() => setWhy(false)} chain={result.chain} seq={logSeqOf(play.state, result.chain.current.id)} /> : null}
      <nav className="proto-cases" aria-label="Cases">
        {moment.cases.map((c) => (
          <a key={c.id} href={`#/styleguide/variants/run/${moment.id}?v=${index + 1}&c=${c.id}`} {...(c.id === current?.id ? { "aria-current": "true" as const } : {})}>{c.label}</a>
        ))}
      </nav>
      <ProtoPicker names={moment.variants.map((v) => v.name)} index={index} onSelect={select} onReplay={again} />
    </>
  );
}

export default function RunVariants(): ReactElement {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const w = where(hash);
  const moment = MOMENTS.find((m) => m.id === w.moment);
  return (
    <LocaleProvider>
      <ToastProvider>{moment ? <Moment moment={moment} query={w.query} /> : <Index />}</ToastProvider>
    </LocaleProvider>
  );
}
