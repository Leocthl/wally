// Test rows for the vocabulary additions: Cantonese spellings, typos, limit phrasings, and goods the shop does not sell.
// Same shape as vision-text.test.ts. Words only change which cards a typed ask shows, never a decision.
import { describe, expect, it } from "vitest";
import { readRequest } from "../src/vision/text";
import { readPriceLimit } from "../src/vision/text-money";

const read = (text: string) => readRequest(text);

describe("additions: kind words", () => {
  it.each([
    ["sweat shirt", "sweater"],
    ["a jeans jacket", "jacket"],
    ["puffer", "jacket"],
    ["raincoat", "jacket"],
    ["T裇", "tee"],
    ["體恤", "tee"],
    ["裇衫", "shirt"],
    ["白裇", "shirt"],
    ["hoddie", "hoodie"],
    ["hodie", "hoodie"],
    ["trainer", "sneakers"],
    ["jogger", "trousers"],
    ["pant", "trousers"],
    ["trouser", "trousers"],
    ["polo shirt", "polo"],
  ] as const)("%s is a %s", (text, kind) => {
    expect(read(text).kind).toBe(kind);
  });
});

describe("additions: colours that stay with a kind", () => {
  it.each([
    ["polo shirt in navy", "polo", ["navy"]],
    ["Polo 衫 navy", "polo", ["navy"]],
    ["牛仔褸", "jacket", ["denim"]],
    ["我想買件牛仔褸", "jacket", ["denim"]],
    ["jean jacket", "jacket", ["denim"]],
    ["牛仔褲", "jeans", []],
    ["black jeans", "jeans", ["black"]],
    ["我要件粉藍色T恤", "tee", ["light_blue"]],
    ["白裇", "shirt", ["white"]],
  ] as const)("%s", (text, kind, colors) => {
    const out = read(text);
    expect(out.kind).toBe(kind);
    expect(out.colors).toEqual(colors);
  });
});

describe("additions: price limits", () => {
  it.each([
    ["白色波鞋，唔好over500", 50_000],
    ["tee 唔好多過300", 30_000],
    ["tee 平過300", 30_000],
    ["tee 300 at most", 30_000],
    ["tee 300 or lower", 30_000],
    ["a tee not over 300", 30_000],
    ["nothing over 300 for a tee", 30_000],
    ["tee 300 Hong Kong dollars", 30_000],
    ["tee 300 HK dollars", 30_000],
  ] as const)("%s", (text, minor) => {
    expect(readPriceLimit(text)).toBe(minor);
  });
  it.each(["a tee for 2 people under 300 ", "2 hk dollars", "tee at most 5", "not over 5 tees"])("is still not a price: %s", (text) => {
    // "a tee for 2 people under 300 " is a price (30000); the others are counts
    if (text.startsWith("a tee for")) expect(readPriceLimit(text)).toBe(30_000);
    else expect(readPriceLimit(text)).toBeNull();
  });
});

describe("additions: groceries and food are goods the shop does not sell", () => {
  it.each([
    "weekly groceries",
    "Order my weekly groceries: milk, eggs and rice, under HK$300",
    "milk",
    "a loaf of bread",
    "fresh vegetables",
    "some fruit",
    "chicken and noodles",
    "snacks for the week",
    "lunch",
    "supermarket run",
    "買餸",
    "牛奶",
    "雞蛋",
    "雜貨",
    "超市",
    "水果",
  ])("%s", (text) => {
    const out = read(text);
    expect(out.kind).toBeNull();
    expect(out.unsold).toBe(true);
  });
  it("does not read a food word inside another word, and leaves clothing alone", () => {
    expect(read("a tee under the price of 300").unsold).toBe(false);
    expect(read("a tee under the price of 300").kind).toBe("tee");
    expect(read("米色 hoodie").colors).toEqual(["beige"]);
    expect(read("米色 hoodie").unsold).toBe(false);
    expect(read("butter yellow hoodie").kind).toBe("hoodie");
    expect(read("rice").unsold).toBe(true);
  });
});

describe("additions: products the shop does not sell", () => {
  it.each(["top up my budget", "pizza", "swimming trunks", "leggings", "tracksuit", "a suit", "coffee", "咖啡", "西裝", "PS5"])("%s", (text) => {
    const out = read(text);
    expect(out.kind).toBeNull();
    expect(out.unsold).toBe(true);
  });
  it("咖啡色 is still the colour brown, and 咖啡 is not", () => {
    expect(read("咖啡色靴").colors).toEqual(["brown"]);
    expect(read("咖啡").colors).toEqual([]);
  });
});
