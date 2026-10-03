// "Ask Wally to buy this": the shopper's pick goes to the same ask the typed field uses, with the item's listing id. The
// planner's proposal is then fixed by code (the shopper chose it); the judge, rules R1 to R12 and the one-off card work as
// for any request, and Wally's screen shows the run. A failed call shows the shell's message and mints nothing.
import { useCallback } from "react";
import type { ShopMatch } from "../../api/types";
import { useBoothContext } from "../../hooks/useBooth";
import { navigate } from "../../hooks/useRoute";
import { itemName, PHOTO } from "../../i18n/photo";
import { useLocale } from "../../ui/locale";
import { noteAsk } from "../run/askEcho";
import { shopName } from "./MatchCards";

export function usePhotoBuy(): (match: ShopMatch) => void {
  const { api, exec } = useBoothContext();
  const { locale, t } = useLocale();
  return useCallback(
    (match: ShopMatch) => {
      const ask = api.ask;
      if (ask === undefined) return;
      const requestText = t(PHOTO.askLine(itemName(locale, match), shopName(match.merchantName)));
      noteAsk(requestText);
      navigate("wally");
      void exec(() => ask.call(api, { requestText, locale, listingId: match.listingId }));
    },
    [api, exec, locale, t],
  );
}
