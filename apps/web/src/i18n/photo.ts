// Strings for "Show Wally a photo" (lane photo): the entry buttons, the sheet that reads a picture, the chips and the
// shop cards. User-facing words only: budget, rules, one-off card, Wally. Figures arrive already formatted, so no
// digit lives here. Every zh-HK line is a draft and marked NEEDS-REVIEW for the native read.
import type { Color, Fit, Kind, Pattern, ReasonId, Style } from "@wally/agent/vision";
import { label, type LabelPair } from "./label";

/** Item types a person can pick (the shop sells these); `other`, `bag` and `not_clothing` are only ever read from a picture. */
export const KIND_WORDS: Readonly<Record<Kind, LabelPair>> = {
  tee: label("tee", "T恤"), // NEEDS-REVIEW
  shirt: label("shirt", "恤衫"), // NEEDS-REVIEW
  polo: label("polo", "Polo 衫"), // NEEDS-REVIEW
  sweater: label("sweater", "針織衫"), // NEEDS-REVIEW
  hoodie: label("hoodie", "衛衣"), // NEEDS-REVIEW
  jacket: label("jacket", "外套"), // NEEDS-REVIEW
  jeans: label("jeans", "牛仔褲"), // NEEDS-REVIEW
  trousers: label("trousers", "長褲"), // NEEDS-REVIEW
  shorts: label("shorts", "短褲"), // NEEDS-REVIEW
  dress: label("dress", "連身裙"), // NEEDS-REVIEW
  skirt: label("skirt", "半身裙"), // NEEDS-REVIEW
  sneakers: label("sneakers", "波鞋"), // NEEDS-REVIEW
  boots: label("boots", "靴"), // NEEDS-REVIEW
  socks: label("socks", "襪"), // NEEDS-REVIEW
  bag: label("bag", "手袋"), // NEEDS-REVIEW
  other: label("item", "款式"), // NEEDS-REVIEW
  not_clothing: label("item", "款式"), // NEEDS-REVIEW
};

export const COLOR_WORDS: Readonly<Record<Color, LabelPair>> = {
  black: label("black", "黑色"), // NEEDS-REVIEW
  white: label("white", "白色"), // NEEDS-REVIEW
  grey: label("grey", "灰色"), // NEEDS-REVIEW
  navy: label("navy", "海軍藍"), // NEEDS-REVIEW
  blue: label("blue", "藍色"), // NEEDS-REVIEW
  light_blue: label("light blue", "淺藍色"), // NEEDS-REVIEW
  green: label("green", "綠色"), // NEEDS-REVIEW
  olive: label("olive", "橄欖綠"), // NEEDS-REVIEW
  red: label("red", "紅色"), // NEEDS-REVIEW
  orange: label("orange", "橙色"), // NEEDS-REVIEW
  yellow: label("yellow", "黃色"), // NEEDS-REVIEW
  pink: label("pink", "粉紅色"), // NEEDS-REVIEW
  purple: label("purple", "紫色"), // NEEDS-REVIEW
  brown: label("brown", "啡色"), // NEEDS-REVIEW
  beige: label("beige", "米色"), // NEEDS-REVIEW
  cream: label("cream", "米白色"), // NEEDS-REVIEW
  denim: label("denim", "牛仔藍"), // NEEDS-REVIEW
};

export const PATTERN_WORDS: Readonly<Record<Pattern, LabelPair>> = {
  plain: label("plain", "純色"), // NEEDS-REVIEW
  stripes: label("striped", "條紋"), // NEEDS-REVIEW
  check: label("check", "格仔"), // NEEDS-REVIEW
  print: label("print", "印花"), // NEEDS-REVIEW
  logo: label("logo", "標誌"), // NEEDS-REVIEW
};

/** Fit words; `regular` is silent in a name ("navy hoodie") but a chip of its own. */
export const FIT_WORDS: Readonly<Record<Exclude<Fit, "unknown">, LabelPair>> = {
  slim: label("slim", "修身"), // NEEDS-REVIEW
  regular: label("regular", "標準"), // NEEDS-REVIEW
  relaxed: label("relaxed", "寬鬆"), // NEEDS-REVIEW
  oversized: label("oversized", "超寬鬆"), // NEEDS-REVIEW
};

export const STYLE_WORDS: Readonly<Record<Style, LabelPair>> = {
  basics: label("basics", "基本款"), // NEEDS-REVIEW
  streetwear: label("streetwear", "街頭"), // NEEDS-REVIEW
  sporty: label("sporty", "運動"), // NEEDS-REVIEW
  smart_casual: label("smart casual", "型格休閒"), // NEEDS-REVIEW
  cozy: label("cozy", "舒適保暖"), // NEEDS-REVIEW
};

/** Why an item is on the list. Templated from the match, never written by a model. */
export const REASON_WORDS: Readonly<Record<ReasonId, LabelPair>> = {
  same_kind: label("Same type", "同類型"), // NEEDS-REVIEW
  close_kind: label("Similar type", "相近類型"), // NEEDS-REVIEW
  same_color: label("same colour", "同色"), // NEEDS-REVIEW
  close_color: label("close colour", "顏色相近"), // NEEDS-REVIEW
  same_pattern: label("same pattern", "圖案相同"), // NEEDS-REVIEW
  same_fit: label("same fit", "版型相同"), // NEEDS-REVIEW
  same_style: label("same style", "風格相近"), // NEEDS-REVIEW
};

export const PHOTO = {
  // Entry points: the Ask sheet button, the Try asking card
  entryButton: label("Show Wally a photo", "俾 Wally 睇相"), // NEEDS-REVIEW
  entryTitle: label("Show Wally a photo", "俾 Wally 睇相"), // NEEDS-REVIEW
  entryDesc: label("Pick a picture or a screenshot. Wally finds similar items.", "揀張相或截圖，Wally 幫你搵相似款式。"), // NEEDS-REVIEW

  // The sheet
  title: label("Show Wally a photo", "俾 Wally 睇相"), // NEEDS-REVIEW
  /** With a model that reads the picture. */
  lead: label("Wally reads your picture and finds similar items in the simulated shop. You pick; the rules still decide.", "Wally 讀你張相，喺模擬商店搵相似款式。由你揀，仍然由規則決定。"), // NEEDS-REVIEW
  /** With the colours only: the shopper says what it is. */
  leadPlates: label("Wally takes the colours from your picture and you say what it is. Wally finds similar items in the simulated shop. You pick; the rules still decide.", "Wally 由你張相取顏色，你話俾佢知係乜嘢款式，佢喺模擬商店搵相似款式。由你揀，仍然由規則決定。"), // NEEDS-REVIEW
  yourPicture: label("Your picture", "你的相片"), // NEEDS-REVIEW
  looking: label("Wally is looking", "Wally 睇緊"), // NEEDS-REVIEW
  lookingDetail: label("Reading the picture. This takes a few seconds.", "讀緊相片，需時數秒。"), // NEEDS-REVIEW
  cancel: label("Cancel", "取消"), // NEEDS-REVIEW
  announceLooking: label("Reading your picture.", "讀緊你的相片。"), // NEEDS-REVIEW
  announceLookingWords: label("Looking in the demo shop.", "喺示範商店搵緊。"), // NEEDS-REVIEW
  announceFound: (count: number): LabelPair => label(count === 1 ? "Done. One similar item is listed below." : `Done. ${count} similar items are listed below.`, `完成。下面列出 ${count} 件相似款式。`), // NEEDS-REVIEW
  announceNone: label("Done. Nothing to show yet. Pick the type to see similar items.", "完成。暫時未有款式顯示，請揀款式去睇相似款式。"), // NEEDS-REVIEW
  announceUpdated: (count: number): LabelPair => label(count === 0 ? "List updated. Nothing matches now." : `List updated. ${count} shown.`, count === 0 ? "名單已更新，冇相符款式。" : `名單已更新，顯示 ${count} 件。`), // NEEDS-REVIEW
  announceProblem: label("Wally could not look just now.", "Wally 暫時睇唔到。"), // NEEDS-REVIEW

  // Privacy: said plainly, in the words that are true for this booth
  privacyDevice: label("Your picture stays on this device and is not saved.", "你的相片只留喺呢部裝置，唔會儲存。"), // NEEDS-REVIEW
  privacyModel: label("Your picture is read once by the model on the booth Mac and is not saved.", "你的相片只會由展位 Mac 上的模型讀一次，唔會儲存。"), // NEEDS-REVIEW

  // What Wally sees (a model's reading) or looks for (after the shopper has changed a chip, or from words)
  sees: (words: string): LabelPair => label(`Wally sees: ${words}`, `Wally 見到：${words}`), // NEEDS-REVIEW
  lookingFor: (words: string): LabelPair => label(`Looking for: ${words}`, `搵緊：${words}`), // NEEDS-REVIEW
  seesNothingYet: label("Wally sees the colours. What is it?", "Wally 見到顏色。係乜嘢款式？"), // NEEDS-REVIEW
  whichKind: label("Which kind of item?", "你想要邊類款式？"), // NEEDS-REVIEW
  fromPlates: label("Colours in your picture", "相片入面的顏色"), // NEEDS-REVIEW
  typeGroup: label("Type of item", "款式"), // NEEDS-REVIEW
  typePick: label("Pick the type", "揀款式"), // NEEDS-REVIEW
  colorGroup: label("Colours (up to three)", "顏色（最多三種）"), // NEEDS-REVIEW
  changeGroup: label("Change what Wally looks for", "改變 Wally 搵嘅條件"), // NEEDS-REVIEW
  patternGroup: label("Pattern", "圖案"), // NEEDS-REVIEW
  fitGroup: label("Fit", "版型"), // NEEDS-REVIEW
  styleGroup: label("Style (up to two)", "風格（最多兩種）"), // NEEDS-REVIEW

  // Words instead of a picture: the typed Ask where no live planner runs, and the way out when the planner cannot pick
  wordsTitle: label("What Wally found", "Wally 搵到嘅款式"), // NEEDS-REVIEW
  wordsLead: label("Showing matches from the demo shop. You pick; the rules still decide.", "顯示示範商店入面嘅相似款式。由你揀，仍然由規則決定。"), // NEEDS-REVIEW
  wordsNothing: label("Wally could not tell what kind of item you meant.", "Wally 唔肯定你想要邊類款式。"), // NEEDS-REVIEW
  wordsNotSold: label("Wally can't shop for that in the demo shop.", "示範商店買唔到呢類貨品。"), // NEEDS-REVIEW
  wordsPickKind: label("Pick something Wally can find:", "請揀 Wally 搵得到嘅款式："), // NEEDS-REVIEW
  limitLabel: label("Price limit", "價錢上限"), // NEEDS-REVIEW
  limitRemove: label("Remove the limit", "取消上限"), // NEEDS-REVIEW
  noneUnderLimit: label("Nothing in the demo shop costs that little. Remove the limit to see more.", "示範商店冇咁平嘅款式。取消上限就睇到更多。"), // NEEDS-REVIEW
  canShop: label("Wally can shop for", "Wally 可以幫你買"), // NEEDS-REVIEW

  // The shop
  similar: label("Similar in the shop", "商店入面相似的款式"), // NEEDS-REVIEW
  shopNote: label("The shop is simulated. Nothing here is a real item.", "商店係模擬的，呢度冇真實貨品。"), // NEEDS-REVIEW
  fitsBudget: label("Fits your budget", "預算夠"), // NEEDS-REVIEW
  overBudget: label("More than is left", "超過尚餘預算"), // NEEDS-REVIEW
  plusShipping: label("plus shipping", "另加運費"), // NEEDS-REVIEW
  cardFor: label("One-off card for", "一次性卡金額"), // NEEDS-REVIEW
  buy: label("Ask Wally to buy this", "叫 Wally 買呢件"), // NEEDS-REVIEW
  buyNamed: (name: string): LabelPair => label(`Ask Wally to buy: ${name}`, `叫 Wally 買：${name}`), // NEEDS-REVIEW
  pickPrompt: label("Tap an item to pick it.", "撳一件款式去揀。"), // NEEDS-REVIEW
  buyNote: label("Wally still checks the rules before any card is made.", "Wally 發出任何卡之前，仍會先按規則檢查。"), // NEEDS-REVIEW
  askLine: (name: string, shop: string): LabelPair => label(`${name} from ${shop}`, `${shop} 的${name}`), // NEEDS-REVIEW

  // Empty and error states
  notClothing: label("That does not look like something to wear.", "呢張相睇落唔似係可以著的嘢。"), // NEEDS-REVIEW
  notClothingHint: label("Try another picture, or pick the type yourself.", "試吓另一張相，或者自己揀款式。"), // NEEDS-REVIEW
  modelFailed: label("Wally could not read this picture, so pick the type yourself.", "Wally 讀唔到呢張相，請自己揀款式。"), // NEEDS-REVIEW
  noMatch: label("Nothing like this in the shop yet. Try another type.", "商店暫時冇相似款式。試吓揀另一款。"), // NEEDS-REVIEW
  noKindYet: label("Pick the type above to see similar items.", "揀咗款式就會見到相似款式。"), // NEEDS-REVIEW
  unreadable: label("That file could not be read as a picture.", "讀唔到呢個檔案，唔似係相片。"), // NEEDS-REVIEW
  unreadableHint: label("Use a JPEG, PNG or WebP picture, or a photo from your camera.", "請用 JPEG、PNG 或 WebP 相片，或者用相機影的相。"), // NEEDS-REVIEW
  tooLarge: label("That picture is too large.", "呢張相太大。"), // NEEDS-REVIEW
  tooLargeHint: label("Try a smaller picture or a screenshot.", "試吓用細啲的相片或截圖。"), // NEEDS-REVIEW
  failed: label("Wally could not look just now.", "Wally 暫時睇唔到。"), // NEEDS-REVIEW
  failedHint: label("Check the connection and try again. Nothing was bought.", "請檢查連線再試。冇買任何嘢。"), // NEEDS-REVIEW
  opening: label("Opening.", "打開緊。"), // NEEDS-REVIEW
  openFailed: label("Wally could not open this just now. Please try again.", "Wally 暫時打開唔到，請再試一次。"), // NEEDS-REVIEW
  lookupFailed: label("Wally could not update the list just now. This is the list for your last choice.", "Wally 暫時更新唔到名單，顯示嘅係你上一次揀嘅結果。"), // NEEDS-REVIEW
  tryAgain: label("Try again", "再試一次"), // NEEDS-REVIEW
  chooseAnother: label("Choose another picture", "揀另一張相"), // NEEDS-REVIEW
  close: label("Close", "關閉"), // NEEDS-REVIEW
} as const;

// ---------- Names built from the typed words, in either language ----------

type Locale = "en" | "zh-HK";
const pick = (locale: Locale, text: LabelPair): string => (locale === "zh-HK" ? text.zh : text.en);

export interface Nameable {
  readonly kind: Kind;
  readonly colors: readonly Color[];
  readonly pattern: Pattern | null;
  readonly fit: Fit | null;
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "Navy relaxed hoodie", "Cream relaxed print tee" / "海軍藍寬鬆衛衣". Built from the typed fields, the same on every screen. */
export function itemName(locale: Locale, item: Nameable): string {
  const color = item.colors[0] === undefined ? [] : [pick(locale, COLOR_WORDS[item.colors[0]])];
  const fit = item.fit === null || item.fit === "unknown" || item.fit === "regular" ? [] : [pick(locale, FIT_WORDS[item.fit])];
  const pattern = item.pattern === null || item.pattern === "plain" ? [] : [pick(locale, PATTERN_WORDS[item.pattern])];
  const kind = pick(locale, KIND_WORDS[item.kind]);
  return locale === "zh-HK" ? [...color, ...fit, ...pattern, kind].join("") : capitalise([...color, ...fit, ...pattern, kind].join(" "));
}

/** The colours as a short phrase: "navy", "navy and white" / "海軍藍同白色". */
export function colorPhrase(locale: Locale, colors: readonly Color[]): string {
  const words = colors.slice(0, 2).map((c) => pick(locale, COLOR_WORDS[c]));
  return words.join(locale === "zh-HK" ? "同" : " and ");
}

/** What Wally sees, from the typed fields: "navy, relaxed hoodie". Without a kind it names the colours only. */
export function seesPhrase(locale: Locale, view: { readonly kind: Kind | null; readonly colors: readonly Color[]; readonly pattern: Pattern | null; readonly fit: Fit | null }): string {
  const colors = colorPhrase(locale, view.colors);
  if (view.kind === null) return colors;
  const fit = view.fit === null || view.fit === "unknown" ? [] : [pick(locale, FIT_WORDS[view.fit])];
  const pattern = view.pattern === null || view.pattern === "plain" ? [] : [pick(locale, PATTERN_WORDS[view.pattern])];
  const kind = pick(locale, KIND_WORDS[view.kind]);
  const noun = locale === "zh-HK" ? [...fit, ...pattern, kind].join("") : [...fit, ...pattern, kind].join(" ");
  const sep = locale === "zh-HK" ? "，" : ", ";
  return colors === "" ? noun : `${colors}${sep}${noun}`;
}

/** The reasons a card shows, at most two, joined: "Same type, close colour" / "同類型，顏色相近". */
export function reasonLine(locale: Locale, reasons: readonly ReasonId[]): string {
  const [first, second] = reasons;
  const words = [first, second].flatMap((r) => (r === undefined ? [] : [pick(locale, REASON_WORDS[r])]));
  const joined = words.join(locale === "zh-HK" ? "，" : ", ");
  return locale === "zh-HK" ? joined : capitalise(joined);
}
