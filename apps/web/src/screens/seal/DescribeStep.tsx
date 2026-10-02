// Step two: the budget in a sentence (with example chips), then the rules as rows. The sentence fills the rows through
// the deterministic compile; "Read my sentence" appears only when a later wave passes suggestRules. Nothing seals here.
import { useState, type FormEvent, type ReactElement } from "react";
import { UI } from "../../i18n/ui";
import { Button } from "../../ui/Button";
import { TextArea } from "../../ui/Form";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { EXAMPLES, type SealExample } from "./examples";
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
}

export function DescribeStep(props: DescribeStepProps): ReactElement {
  const { sentence, form, errors, shown, now, today, suggestRules, onSentence, onForm, onTouch, onNext, incomplete } = props;
  const { t } = useLocale();
  const [reading, setReading] = useState(false);
  const [readFailed, setReadFailed] = useState(false);

  const pickExample = (ex: SealExample): void => {
    const read = applySentence(EMPTY_FORM(now), ex.sentence.en, now);
    onSentence(t(ex.sentence), read.form, read.complete);
  };
  const type = (text: string): void => {
    const read = applySentence(form, text, now);
    onSentence(text, read.form, read.complete);
  };
  const readWithModel = async (): Promise<void> => {
    if (!suggestRules) return;
    setReading(true);
    setReadFailed(false);
    try {
      const rules = await suggestRules(sentence);
      if (rules) onForm({ ...formFromRules(rules, `${form.until}T00:00:00Z`), until: form.until });
      else setReadFailed(true);
    } catch {
      setReadFailed(true);
    } finally {
      setReading(false);
    }
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    onNext();
  };

  return (
    <form className="seal-step" onSubmit={submit} noValidate aria-labelledby="seal-describe-title">
      <div className="seal-sentence">
        <TextArea label={t(UI["seal.sentence"])} rows={3} maxLength={SENTENCE_MAX} value={sentence} onChange={(e) => type(e.target.value)} />
        <div className="seal-examples" role="group" aria-label={t(UI["seal.examples"])}>
          <span className="seal-examples__label" aria-hidden="true">{t(UI["seal.examples"])}</span>
          {EXAMPLES.map((ex) => (
            <button key={ex.id} type="button" className="seal-example" data-example={ex.id} onClick={() => pickExample(ex)}>
              {t(UI[`seal.ex.${ex.id}`])}
            </button>
          ))}
        </div>
        {suggestRules ? (
          <Button variant="secondary" size="sm" icon={<Icon name="sparkle" size={18} />} loading={reading} onClick={() => void readWithModel()}>
            {t(UI["seal.readSentence"])}
          </Button>
        ) : null}
        <p className="seal-note" role="status">
          {readFailed ? t(UI["seal.readFailed"]) : incomplete ? t(UI["seal.notFound"]) : ""}
        </p>
      </div>
      <section className="seal-rules-block" aria-labelledby="seal-rules-title">
        <h2 id="seal-rules-title" className="seal-h2">{t(UI["seal.rulesTitle"])}</h2>
        <p className="seal-lead">{t(UI["seal.rulesLead"])}</p>
        <RulesEditor form={form} errors={errors} shown={shown} today={today} onChange={onForm} onTouch={onTouch} />
      </section>
      <div className="seal-actions">
        <Button type="submit" size="lg" block iconEnd={<Icon name="chevronRight" size={20} />}>{t(UI["seal.next"])}</Button>
      </div>
    </form>
  );
}
