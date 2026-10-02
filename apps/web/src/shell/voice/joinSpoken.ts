// Spoken words go after whatever was typed in the field: what was typed stays, then a space, then the spoken words.
// Chinese has no spaces between words, so no space is added where Chinese meets Chinese (the TrickBox hint does the same).
const CJK = /\p{Script_Extensions=Han}/u; // ideographs and the Chinese punctuation written with them

/** typed, one space, spoken, cut at `max`. No space after text that already ends in white space, or when typed is empty. */
export function joinSpoken(typed: string, spoken: string, max: number = Number.POSITIVE_INFINITY): string {
  const words = spoken.trim();
  if (words === "") return typed;
  const last = typed.slice(-1);
  const bare = typed === "" || /\s/.test(last) || (CJK.test(last) && CJK.test(words.charAt(0)));
  return `${typed}${bare ? "" : " "}${words}`.slice(0, max);
}
