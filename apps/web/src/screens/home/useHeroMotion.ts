// When the Budget hero may move. Wally walks in and the bubble pops once per page load (the first look is the rare
// moment; coming back to Budget from another tab ten times a day is not). After that only a change of mood replays the
// bubble, because the words changed.
import { useEffect, useRef, useState } from "react";

let welcomed = false;

export interface HeroMotion {
  /** True for the first Budget view of this page load: the welcome entrance plays. */
  readonly welcome: boolean;
  /** Changes whenever the mood changes after the first paint; use it as a key to replay the bubble. */
  readonly moodSeq: number;
}

export function useHeroMotion(mood: string): HeroMotion {
  const [welcome] = useState(() => !welcomed);
  const previous = useRef<string | null>(null);
  const [moodSeq, setMoodSeq] = useState(0);
  useEffect(() => {
    welcomed = true;
  }, []);
  useEffect(() => {
    if (previous.current !== null && previous.current !== mood) setMoodSeq((n) => n + 1);
    previous.current = mood;
  }, [mood]);
  return { welcome, moodSeq };
}

/** Starts the welcome again (tests, the demo reset). */
export function forgetWelcome(): void {
  welcomed = false;
}
