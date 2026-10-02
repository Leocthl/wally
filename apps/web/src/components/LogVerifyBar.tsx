// Verify and Tamper for the booth log (DM7). The result says what was and was not checked: the mock cannot check signatures.
import type { ReactElement } from "react";
import type { VerifyOutcome } from "../api/types";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { StateBadge } from "./StateBadge";

export interface LogVerifyBarProps {
  readonly onVerify: () => void;
  readonly onTamper: () => void;
  readonly onRestore: () => void;
  readonly tampered: boolean;
  readonly outcome: VerifyOutcome | null;
  readonly disabled?: boolean;
}

export function LogVerifyBar({ onVerify, onTamper, onRestore, tampered, outcome, disabled = false }: LogVerifyBarProps): ReactElement {
  const result = outcome?.result;
  return (
    <div className="verify-bar" data-register="ledger">
      <div className="verify-bar__buttons">
        <button type="button" className="btn btn--primary tap" onClick={onVerify} disabled={disabled}><Bi text={S.verify} /></button>
        <button type="button" className="btn tap" onClick={onTamper} disabled={disabled || tampered}><Bi text={S.tamper} /></button>
        <button type="button" className="btn tap" onClick={onRestore} disabled={disabled || !tampered}><Bi text={S.restore} /></button>
      </div>
      {tampered ? <Bi as="p" text={S.tamperedNote} className="soft" /> : null}
      <div role="status" className="verify-bar__result">
        {result ? (
          result.ok ? (
            <>
              <StateBadge tone="minted" text="VERIFIED" zh="驗證通過" />
              <Bi text={S.verifyOk} />
            </>
          ) : (
            <>
              <StateBadge tone="stopped" text="BROKEN" zh="已中斷" />
              <p>
                Chain broken at entry <strong data-ident>{result.failedSeq}</strong> <code data-ident>{result.reason}</code>
              </p>
              <p lang="zh-HK">紀錄鏈於第 <strong data-ident>{result.failedSeq}</strong> 筆中斷</p>
            </>
          )
        ) : null}
        {outcome && outcome.skipped.length > 0 ? (
          <p className="soft">
            <span className="bi__en">{S.notChecked.en}</span> <span lang="zh-HK">{S.notChecked.zh}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
