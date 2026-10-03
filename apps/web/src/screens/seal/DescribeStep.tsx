// Step two: the budget in a sentence (with example chips), then the rules as rows. The sentence fills the rows through
// the deterministic compile as it is typed (an end date fills Until; one further off than a budget may run is cut, with a
// note that goes when the row is changed by hand); "Read my sentence" asks the booth's reader (suggestRules) and shows
// what it read above the rows. When the reader is absent or fails, the rows keep what the deterministic compile filled.
// Nothing seals here.
import { useState, type FormEvent, type ReactElement } from "react";
import type { CompileResult } from "../../api/types";
import { UI } from "../../i18n/ui";
import { useProfile } from "../../state/useProfile";
import { Button } from "../../ui/Button";
import { TextArea } from "../../ui/Form";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { examplesFor, type SealExample } from "./examples";
import { ReadResult } from "./ReadResult";
import { RulesEditor } from "./RulesEditor";
import { applySentence, EMPTY_FORM, formFromRules, SENTENCE_MAX, type FieldName, type FormErrors, type RulesForm, type SuggestRules } from "./sealModel";

export interface DescribeStepProps {
  readonly sentence: string;
  readonly form: RulesForm;
  readonly errors: FormErrors;
  readonly shown: ReadonlySet<FieldName>;
  readonly now: Date;
  readonly today: string;
  readonly suggestRules?: SuggestRules;
  readonly onSentence: (sentence: string, form: RulesForm, complete: boolean) => void;
  readonly onForm: (form: RulesForm) => void;
  readonly onTouch: (field: FieldName) => void;
  readonly onNext: () => void;
  /** The sentence left some rules out: say so once, quietly. */
  readonly incomplete: boolean;
  /** Words beside a field that show at once, such as a limit set by someone else (Mum's budget). */
  readonly notes?: Partial<Record<FieldName, string>>;
}

export function DescribeStep(props: DescribeStepProps): ReactElement {
  const { sentence, form, errors, shown, now, today, suggestRules, onSentence, onForm, onTouch, onNext, incomplete } = props;
  const { t, locale } = useLocale();
  const { profile } = useProfile();
  const examples = examplesFor(profile?.shopFor ?? []);
  const [reading, setReading] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [read, setRead] = useState<CompileResult | null>(null);
  // The day the typed sentence's date was cut to. The note shows only while Until still holds it.
  const [cappedTo, setCappedTo] = useState<string | null>(null);

  const pickExample = (ex: SealExample): void => {
    const picked = applySentence(EMPTY_FORM(now), ex.sentence.en, now);
    setRead(null);
    setCappedTo(picked.cappedTo);
    onSentence(t(ex.sentence), picked.form, picked.complete);
  };
  const type = (text: string): void => {
    const typed = applySentence(form, text, now);
    setRead(null); // what the reader found was about the earlier words
    setCappedTo(typed.cappedTo);
    onSentence(text, typed.form, typed.complete);
  };
  const readWithModel = async (): Promise<void> => {
    if (!suggestRules) return;
    setReading(true);
    setReadFailed(false);
    try {
      const result = await suggestRules(sentence, locale);
      if (result) {
        onForm(formFromRules(result.rules, result.validUntil));
        setCappedTo(null); // the reader's own clamps are listed in what it read
        setRead(result);
      } else {
        setRead(null);
        setReadFailed(true);
      }
    } catch {
      // The booth could not read it (offline, busy, refused): the rows keep what the typed sentence filled in.
      setRead(null);
      setReadFailed(true);
    } finally {
      setReading(false);
    }
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    onNext();
  };
  const cut = cappedTo !== null && cappedTo === form.until;
  const status = readFailed ? t(UI["seal.readFailed"]) : [cut ? t(UI["seal.untilCapped"]) : "", incomplete ? t(UI["seal.notFound"]) : ""].filter(Boolean).join(" ");

  return (
    <form className="seal-step" onSubmit={submit} noValidate aria-labelledby="seal-describe-title">
      <div className="seal-sentence">
        <TextArea label={t(UI["seal.sentence"])} rows={3} maxLength={SENTENCE_MAX} value={sentence} onChange={(e) => type(e.target.value)} />
        <div className="seal-examples" role="group" aria-label={t(UI["seal.examples"])}>
          <span className="seal-examples__label" aria-hidden="true">{t(UI["seal.examples"])}</span>
          {examples.map((ex) => (
            <button key={ex.id} type="button" className="seal-example" data-example={ex.id} onClick={() => pickExample(ex)}>
              {t(UI[`seal.ex.${ex.id}`])}
            </button>
          ))}
        </div>
        {suggestRules ? (
          <Button variant="secondary" size="sm" icon={<Icon name="settings" size={18} />} loading={reading} disabled={sentence.trim().length === 0} onClick={() => void readWithModel()}>
            {t(UI["seal.readSentence"])}
          </Button>
        ) : null}
        <p className="seal-note" role="status">{status}</p>
      </div>
      {read ? <ReadResult result={read} /> : null}
      <section className="seal-rules-block" aria-labelledby="seal-rules-title">
        <h2 id="seal-rules-title" className="seal-h2">{t(UI["seal.rulesTitle"])}</h2>
        <p className="seal-lead">{t(UI["seal.rulesLead"])}</p>
        <RulesEditor form={form} errors={errors} shown={shown} today={today} onChange={onForm} onTouch={onTouch} {...(props.notes ? { notes: props.notes } : {})} />
      </section>
      <div className="seal-actions">
        <Button type="submit" size="lg" block iconEnd={<Icon name="chevronRight" size={20} />}>{t(UI["seal.next"])}</Button>
      </div>
    </form>
  );
}
