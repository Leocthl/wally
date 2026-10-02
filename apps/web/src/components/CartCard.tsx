// CartCard (docs/04, PACKET): lines, shipping, fees, FX and the total, the figure R3 compares.
import type { ReactElement } from "react";
import type { Prov } from "../domain/provenance";
import { S } from "../i18n/strings";
import type { Cart } from "../api/types";
import { Bi } from "./Bi";
import { ChipScope } from "./ChipScope";
import { Num } from "./Num";

export function CartCard({ cart, prov }: { readonly cart: Cart; readonly prov: Prov }): ReactElement {
  return (
    <section className="card cart-card" data-register="packet" aria-labelledby={`cart-${cart.id}`}>
      <ChipScope provs={[prov]}>
        <h3 id={`cart-${cart.id}`}><Bi text={S.cartTitle} /></h3>
        <p className="soft">
          {cart.merchant.name} <span className="mono" data-ident>{cart.merchant.domain}</span>
        </p>
        <table className="cart-card__lines">
          <tbody>
            {cart.items.map((item, i) => (
              <tr key={`${item.title}-${i}`}>
                <th scope="row">{item.title}</th>
                <td><Num kind="count" value={item.qty} prov={prov} chip="scope" /></td>
                <td><Num kind="money" value={item.qty * item.unit_price_minor} prov={prov} chip="scope" /></td>
              </tr>
            ))}
            <tr><th scope="row"><Bi text={S.shipping} /></th><td /><td><Num kind="money" value={cart.shipping_minor} prov={prov} chip="scope" /></td></tr>
            <tr><th scope="row"><Bi text={S.fees} /></th><td /><td><Num kind="money" value={cart.fees_minor} prov={prov} chip="scope" /></td></tr>
            {cart.fx ? (
              <tr><th scope="row"><Bi text={S.fx} /></th><td /><td><Num kind="money" value={cart.fx.fee_minor} prov={prov} chip="scope" /></td></tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="cart-card__total">
              <th scope="row"><Bi text={S.total} /></th>
              <td />
              <td><Num kind="money" value={cart.total_minor} prov={prov} chip="scope" className="cart-card__total-num" /></td>
            </tr>
          </tfoot>
        </table>
        <Bi as="p" text={S.totalNote} className="soft" />
      </ChipScope>
    </section>
  );
}
