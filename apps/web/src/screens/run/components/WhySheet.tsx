// "Why?": the checks in plain words (your budget, your rules, seller, Wally's read of the listing, card limit), each with
// a pass, stop or ask icon and one line, then "Details for nerds". Opened from Approved, Stopped and Needs your OK.
import type { ReactElement } from "react";
import { UI } from "../../../i18n/ui";
import { Tag, type TagTone } from "../../../ui/Chip";
import { Icon, type IconName } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Sheet } from "../../../ui/Overlay";
import { List, ListRow } from "../../../ui/Surface";
import type { Chain } from "../model/chain";
import { checksFor, type CheckStatus } from "../model/checks";
import { NerdDetails } from "./NerdDetails";

const R = UI.run;

const LOOK: Readonly<Record<CheckStatus, { readonly icon: IconName; readonly tone: "ok" | "stop" | "warn" | "neutral"; readonly tag: TagTone }>> = {
  pass: { icon: "check", tone: "ok", tag: "ok" },
  stop: { icon: "hand", tone: "stop", tag: "stop" },
  ask: { icon: "alert", tone: "warn", tag: "warn" },
  skip: { icon: "clock", tone: "neutral", tag: "neutral" },
};

const STATUS_TEXT = { pass: R.statusPass, stop: R.statusStop, ask: R.statusAsk, skip: R.statusSkip } as const;

export interface WhySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly chain: Chain;
  readonly seq: number | undefined;
}

export function WhySheet({ open, onClose, chain, seq }: WhySheetProps): ReactElement {
  const { t, locale } = useLocale();
  const outcome = chain.current.outcome;
  const title = outcome === "APPROVE" ? R.whyApprovedTitle : outcome === "ESCALATE" ? R.whyAskTitle : R.whyStoppedTitle;
  return (
    <Sheet open={open} onClose={onClose} title={t(title)} description={t(R.rulesDecided)}>
      <div lang={locale}>
        <List inset label={t(R.checksLabel)} className="run-checks">
          {checksFor(chain).map((row) => {
            const look = LOOK[row.status];
            return (
              <ListRow
                key={row.id}
                leading={<Icon name={look.icon} />}
                tone={look.tone}
                title={t(row.name)}
                subtitle={t(row.line)}
                trailing={<Tag size="sm" tone={look.tag}>{t(STATUS_TEXT[row.status])}</Tag>}
                className="run-check"
              />
            );
          })}
        </List>
        <NerdDetails decision={chain.current} seq={seq} />
      </div>
    </Sheet>
  );
}
