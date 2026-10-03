// The keyword tables of the typed request reader (text.ts): English and Traditional Chinese words for the kinds the shop
// sells, the colours, the patterns, the fits and the styles, plus a few products the shop does not sell. Fixed lists, no
// model; a word the shopper uses that is not here is simply not read. A Latin word matches whole words only (with an
// optional plural s), a Chinese word matches wherever it stands; the longest word at a place wins, so "t-shirt" is a tee
// and "牛仔褲" is jeans, not trousers.
import type { Color, Fit, Kind, Pattern, Style } from "./vocab";

export interface Term<T> {
  readonly value: T;
  readonly words: readonly string[];
  /** Counts only when no ordinary word of its group is found: 衫 (any top), 褲, 裙, 鞋, 袋. */
  readonly weak?: true;
}

export const KIND_TERMS: readonly Term<Kind>[] = [
  { value: "tee", words: ["t-shirt", "t shirt", "tshirt", "tee shirt", "tee", "t恤", "tee恤", "t裇", "tee裇", "體恤", "短袖", "tank top", "singlet", "背心"] },
  { value: "tee", words: ["top", "衫"], weak: true },
  { value: "shirt", words: ["shirt", "blouse", "button-up", "button up", "button-down", "dress shirt", "恤衫", "裇衫", "襯衫", "衬衫", "襯衣"] },
  { value: "shirt", words: ["裇"], weak: true },
  { value: "polo", words: ["polo", "polo shirt", "polo衫", "polo 衫", "polo裇", "polo 裇"] },
  { value: "sweater", words: ["sweater", "jumper", "pullover", "cardigan", "knitwear", "knit", "sweatshirt", "sweat shirt", "crewneck", "針織", "針織衫", "冷衫", "毛衣", "毛衫", "開衫"] },
  { value: "hoodie", words: ["hoodie", "hoody", "hoddie", "hodie", "hooded", "hooded sweatshirt", "衛衣", "卫衣", "帽衫", "連帽", "連帽衛衣"] },
  { value: "jacket", words: ["jacket", "jeans jacket", "coat", "blazer", "windbreaker", "bomber", "parka", "puffer", "puffa", "anorak", "raincoat", "overcoat", "outerwear", "外套", "夾克", "夹克", "褸", "面包服", "麵包服", "大褸", "風褸", "西裝褸", "西裝外套"] },
  { value: "jeans", words: ["jeans", "denim pants", "denim trousers", "牛仔褲", "牛仔裤", "丹寧褲"] },
  { value: "trousers", words: ["trousers", "trouser", "pants", "pant", "chinos", "slacks", "dress pants", "sweatpants", "sweat pants", "joggers", "jogger", "cargo pants", "cargos", "長褲", "长裤", "西褲", "西裤", "運動褲", "休閒褲"] },
  { value: "trousers", words: ["褲"], weak: true },
  { value: "shorts", words: ["shorts", "短褲", "短裤", "熱褲", "五分褲"] },
  { value: "dress", words: ["dress", "gown", "連身裙", "連衣裙", "连衣裙", "洋裝", "件裙"] },
  { value: "dress", words: ["裙"], weak: true },
  { value: "skirt", words: ["skirt", "半身裙", "短裙", "長裙", "百褶裙", "條裙"] },
  { value: "sneakers", words: ["sneakers", "sneaker", "sneekers", "snekers", "trainers", "trainer", "kicks", "runners", "runner", "footwear", "running shoes", "sports shoes", "dress shoes", "shoes", "shoe", "波鞋", "運動鞋", "运动鞋", "球鞋", "布鞋", "皮鞋", "鞋仔"] },
  { value: "sneakers", words: ["鞋"], weak: true },
  { value: "boots", words: ["boots", "boot", "chelsea boots", "靴", "長靴", "短靴", "馬丁靴"] },
  { value: "socks", words: ["socks", "sock", "ankle socks", "crew socks", "襪", "襪子", "短襪", "長襪", "袜", "袜子"] },
  { value: "bag", words: ["handbag", "tote", "backpack", "rucksack", "purse", "bag", "手袋", "背囊", "背包", "斜孭袋"] },
  { value: "bag", words: ["袋"], weak: true },
];

export const COLOR_TERMS: readonly Term<Color>[] = [
  { value: "black", words: ["black", "黑色", "黑"] },
  { value: "white", words: ["white", "白色", "白"] },
  { value: "grey", words: ["grey", "gray", "charcoal", "silver", "灰色", "灰", "銀灰", "銀色"] },
  { value: "navy", words: ["navy blue", "navy", "dark blue", "midnight blue", "深藍", "深藍色", "藏青", "藏藍", "海軍藍", "海軍"] },
  { value: "blue", words: ["blue", "藍色", "蓝色", "藍", "蓝"] },
  { value: "light_blue", words: ["light blue", "sky blue", "baby blue", "pale blue", "淺藍", "淺藍色", "天藍", "水藍", "粉藍", "粉藍色"] },
  { value: "green", words: ["green", "綠色", "绿色", "綠", "绿"] },
  { value: "olive", words: ["olive", "army green", "橄欖綠", "橄欖", "軍綠"] },
  { value: "red", words: ["red", "maroon", "burgundy", "wine red", "紅色", "红色", "酒紅", "紅", "红"] },
  { value: "orange", words: ["orange", "橙色", "橙", "橘色", "橘"] },
  { value: "yellow", words: ["yellow", "mustard", "黃色", "黄色", "黃", "黄"] },
  { value: "pink", words: ["pink", "rose", "粉紅色", "粉紅", "粉色", "桃紅", "粉"] },
  { value: "purple", words: ["purple", "violet", "lilac", "紫色", "紫"] },
  { value: "brown", words: ["brown", "啡色", "啡", "棕色", "棕", "咖啡色"] },
  { value: "beige", words: ["beige", "khaki", "tan", "camel", "米色", "卡其", "卡其色", "杏色"] },
  { value: "cream", words: ["cream", "off-white", "off white", "ivory", "奶白", "奶白色", "牛奶白", "米白", "米白色", "象牙白"] },
  { value: "denim", words: ["denim", "jean", "牛仔藍", "牛仔"] },
];

export const PATTERN_TERMS: readonly Term<Pattern>[] = [
  { value: "stripes", words: ["striped", "stripes", "stripe", "pinstripe", "條紋", "间条", "間條", "橫紋", "橫條"] },
  { value: "check", words: ["checked", "checkered", "check", "plaid", "tartan", "gingham", "格仔", "格子", "格紋"] },
  { value: "print", words: ["printed", "print", "graphic", "印花", "圖案", "图案"] },
  { value: "logo", words: ["logo", "logos", "標誌", "标志"] },
  { value: "plain", words: ["plain", "solid", "素色", "純色", "纯色"] },
];

export const FIT_TERMS: readonly Term<Exclude<Fit, "unknown">>[] = [
  { value: "slim", words: ["slim", "skinny", "fitted", "修身", "緊身"] },
  { value: "regular", words: ["regular", "標準"] },
  { value: "relaxed", words: ["relaxed", "loose", "baggy", "寬鬆", "宽松", "寬身", "鬆身"] },
  { value: "oversized", words: ["oversized", "oversize", "over-sized", "超大", "特大"] },
];

export const STYLE_TERMS: readonly Term<Style>[] = [
  { value: "streetwear", words: ["streetwear", "street style", "街頭", "街头"] },
  { value: "sporty", words: ["sporty", "athletic", "運動風", "运动风", "運動"] },
  { value: "cozy", words: ["cozy", "cosy", "warm", "暖", "舒適"] },
  { value: "basics", words: ["basics", "basic", "everyday", "百搭"] },
  { value: "smart_casual", words: ["smart casual", "smart-casual", "formal", "斯文", "正式"] },
];

/** Products the shop does not sell. They are read so the answer can say so, and so their words are not read as a colour or a kind (藍牙 is Bluetooth, not blue). */
export const UNSOLD_WORDS: readonly string[] = [
  "airpods", "earbuds", "earphones", "headphones", "headset", "耳機", "耳机", "藍牙", "蓝牙",
  "phone", "iphone", "android", "手機", "手机", "laptop", "macbook", "ipad", "tablet", "電腦", "电脑", "charger", "充電", "充电",
  "watch", "手錶", "手表", "sunglasses", "太陽眼鏡", "wallet", "necklace", "bracelet", "ring", "手鏈", "頸鏈",
  "hat", "cap", "beanie", "scarf", "gloves", "belt", "tie", "圍巾", "围巾", "手套", "皮帶", "帽",
  "underwear", "boxers", "bra", "pyjamas", "pajamas", "swimsuit", "bikini", "內褲", "内裤", "泳衣", "睡衣",
  "sandals", "slippers", "heels", "loafers", "flip flops", "flip-flops", "涼鞋", "拖鞋", "高跟鞋",
  "leggings", "tights", "swimming trunks", "swim trunks", "trunks", "tracksuit", "suit", "tuxedo", "西裝",
  "pizza", "food", "coffee", "perfume", "makeup", "umbrella", "ps5", "playstation", "xbox", "nintendo", "bitcoin", "crypto", "咖啡", "top up", "top-up",
  "gift card", "giftcard", "voucher", "coupon", "禮品卡", "礼品卡", "現金券", "優惠券",
  // Groceries and food: a budget can name them, but the demo shop sells none, so the answer says so.
  "groceries", "grocery", "supermarket", "milk", "egg", "bread", "rice", "vegetable", "veggie", "fruit", "meat", "chicken", "beef", "pork", "fish",
  "noodle", "pasta", "cereal", "yogurt", "cheese", "snack", "juice", "beer", "wine", "chocolate", "candy", "cake", "burger", "sushi", "takeaway",
  "買餸", "買菜", "买菜", "雜貨", "杂货", "超市", "牛奶", "鮮奶", "雞蛋", "鸡蛋", "麵包", "面包", "蔬菜", "水果", "生果", "豬肉", "猪肉", "牛肉", "雞肉", "鸡肉", "零食", "蛋糕", "外賣", "外卖",
];
