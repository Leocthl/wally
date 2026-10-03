// A receipt's number as a person reads it, the same on every screen: Home's Recent, the Receipts list and its steps, the Proof
// timeline, the receipt sheet and the Wally screen's details. Receipt 1 is the sealed budget; the log's own sequence starts at 0
// and stays what developer mode shows ("#0"). Kept here, away from the table of Proof's words, so Home can use it without it.
import { label } from "../../i18n/label";

/** The log's sequence number to the number a person reads: counted from 1. */
export function receiptNumber(seq: number): number {
  return seq + 1;
}

/** "Receipt 2" / "第 2 張收據": {n} takes the number as an element, so it can carry its own markup. */
export const RECEIPT_NO = label("Receipt {n}", "第 {n} 張收據"); // NEEDS-REVIEW
