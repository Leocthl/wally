// The labels the page skeleton shows, for each display mode. Developer mode is the page as it always was (strings.ts);
// plain mode is the same page in everyday words (plain/strings.ts). What differs is only words: the layout code takes
// one of these and never asks which mode it is for text.
import type { Field } from "./inputs";
import type { Mode } from "./mode";
import { P } from "./plain/strings";
import { S, type Bi } from "./strings";

export type Action = "verify" | "demo" | "tamper" | "restore";

export interface FieldCopy {
  readonly label: Bi;
  readonly fileLabel: Bi;
}

export interface Copy {
  readonly title: Bi;
  readonly intro: Bi;
  readonly buttons: Readonly<Record<Action, Bi>>;
  readonly fields: Readonly<Record<Field, FieldCopy>>;
  readonly inputsTitle: Bi;
  readonly timelineTitle: Bi;
  readonly computedHere: Bi;
}

export const COPY: Readonly<Record<Mode, Copy>> = {
  developer: {
    title: S.title,
    intro: S.intro,
    buttons: { verify: S.verify, demo: S.loadDemo, tamper: S.tamper, restore: S.restore },
    fields: {
      log: { label: S.logLabel, fileLabel: S.fileLog },
      keys: { label: S.keysLabel, fileLabel: S.fileKeys },
      checkpoint: { label: S.checkpointLabel, fileLabel: S.fileCheckpoint },
    },
    inputsTitle: S.inputsTitle,
    timelineTitle: S.timeline,
    computedHere: S.computedHere,
  },
  plain: {
    title: P.title,
    intro: P.intro,
    buttons: { verify: P.verify, demo: P.loadDemo, tamper: P.tamper, restore: P.restore },
    fields: {
      log: { label: P.logLabel, fileLabel: S.fileLog },
      keys: { label: P.keysLabel, fileLabel: S.fileKeys },
      checkpoint: { label: P.checkpointLabel, fileLabel: S.fileCheckpoint },
    },
    inputsTitle: P.inputsTitle,
    timelineTitle: P.timeline,
    computedHere: P.computedHere,
  },
};
