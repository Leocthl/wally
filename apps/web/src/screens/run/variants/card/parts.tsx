// The rest of the approved screen under the dev-only Ticket and Live card layouts: budget, checkout story, Why, footnote.
// (The shipped layout is components/Approved.tsx; in these two layouts Pay now sits inside the card.)
import type { ReactElement } from "react";
import { UI } from "../../../../i18n/ui";
import { Button } from "../../../../ui/Button";
import { Icon } from "../../../../ui/icons";
import { useLocale } from "../../../../ui/locale";
import type { ApprovedProps } from "../../components/Approved";
import { BudgetNow } from "../../components/BudgetNow";
import { CardStory } from "../../components/CardStory";
import { Footnote } from "../../components/parts";

const R = UI.run;

export function ApprovedRest(p: ApprovedProps & { readonly payInside?: boolean }): ReactElement | null {
  const { t } = useLocale();
  const chain = p.result.chain;
  if (!chain) return null;
  const total = chain.current.approved_limit_minor ?? chain.current.cart.total_minor;
  return (
    <>
      {p.packet ? <BudgetNow packet={p.packet} fromMinor={chain.current.packet.remaining_minor} animate={p.fresh} /> : null}
      <CardStory story={p.result.story} limitMinor={p.result.card?.limit_minor ?? total} />
      <div className="run-actions">
        <Button variant="ghost" block onClick={p.onWhy} icon={<Icon name="info" size={20} />}>{t(R.whyApproved)}</Button>
      </div>
      <Footnote />
    </>
  );
}
