// Primitives: Button, IconButton, Segmented, Tabs, Switch, TextField, BottomTabBar, TopBar. Render, keyboard, ARIA.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "../src/ui/Button";
import { Switch, TextArea, TextField } from "../src/ui/Form";
import { Icon } from "../src/ui/icons";
import { LocaleProvider } from "../src/ui/locale";
import { BottomTabBar, Segmented, Tabs, TopBar } from "../src/ui/Nav";

describe("Button", () => {
  it("renders a real button of type button with variant and size classes", () => {
    render(<Button variant="secondary" size="lg">Top up budget</Button>);
    const b = screen.getByRole("button", { name: "Top up budget" });
    expect(b).toHaveAttribute("type", "button");
    expect(b).toHaveClass("w-btn", "w-btn--secondary", "w-btn--lg");
  });

  it("while loading: stays focusable, is aria-busy and aria-disabled, ignores clicks, and says Loading", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Pay now</Button>);
    const b = screen.getByRole("button", { name: /Pay now/ });
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    expect(b).toHaveTextContent("Loading");
  });

  it("disabled ignores clicks; enabled fires once per press, also from the keyboard", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button disabled onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Button onClick={onClick}>Go</Button>);
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("IconButton has its label as the accessible name and tooltip, icon hidden", () => {
    render(<IconButton label="Close" icon={<Icon name="close" />} />);
    const b = screen.getByRole("button", { name: "Close" });
    expect(b).toHaveAttribute("title", "Close");
    expect(b.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("says Loading in zh-HK under the zh-HK locale", () => {
    render(<LocaleProvider locale="zh-HK"><Button loading>付款</Button></LocaleProvider>);
    expect(screen.getByRole("button")).toHaveTextContent("載入中");
  });
});

function Lang(): ReactElement {
  const [v, setV] = useState<"en" | "zh-HK">("en");
  return <Segmented label="Language" value={v} onChange={setV} options={[{ value: "en", label: "EN", ariaLabel: "English" }, { value: "zh-HK", label: "繁", lang: "zh-HK", ariaLabel: "繁體中文" }]} />;
}

describe("Segmented", () => {
  it("is a radio group with one tab stop; arrows, Home and End move and select", async () => {
    render(<Lang />);
    const group = screen.getByRole("radiogroup", { name: "Language" });
    const [en, zh] = screen.getAllByRole("radio");
    expect(group).toBeInTheDocument();
    expect(en).toHaveAttribute("aria-checked", "true");
    expect(zh).toHaveAttribute("tabindex", "-1");
    expect(zh).toHaveAttribute("lang", "zh-HK");
    en?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "繁體中文" })).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "繁體中文" }));
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "繁體中文" })).toHaveAttribute("aria-checked", "true");
  });
});

function TabsDemo(): ReactElement {
  const [v, setV] = useState("a");
  return <Tabs label="Views" value={v} onChange={setV} items={[{ id: "a", label: "Receipts", panel: <p>List</p> }, { id: "b", label: "Rules", panel: <p>Signed</p> }]} />;
}

describe("Tabs", () => {
  it("links tabs and panels, shows one panel, and moves with the arrows", async () => {
    render(<TabsDemo />);
    const tab = screen.getByRole("tab", { name: "Receipts" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("List");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tab.id);
    tab.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Signed");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Receipts" })).toHaveFocus();
  });
});

describe("Switch", () => {
  it("is role switch with aria-checked, toggled by click, Space and Enter", async () => {
    function Demo(): ReactElement {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onChange={setOn} label="Ask before paying" description="Needs your OK" />;
    }
    render(<Demo />);
    const sw = screen.getByRole("switch", { name: "Ask before paying" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAccessibleDescription("Needs your OK");
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.keyboard("{Enter}");
    expect(sw).toHaveAttribute("aria-checked", "true");
  });
});

describe("TextField and TextArea", () => {
  it("labels the input, links hint and error, and marks it invalid with words, not colour", () => {
    render(<TextField label="Budget" hint="In Hong Kong dollars" error="Over the limit" />);
    const input = screen.getByRole("textbox", { name: "Budget" });
    expect(input).toHaveAccessibleDescription("In Hong Kong dollars Over the limit");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Over the limit").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps a hidden label as the accessible name of the pill composer", async () => {
    render(<TextField variant="pill" hideLabel label="What should Wally buy?" placeholder="Ask Wally to buy..." />);
    const input = screen.getByRole("textbox", { name: "What should Wally buy?" });
    await userEvent.type(input, "socks");
    expect(input).toHaveValue("socks");
    render(<TextArea label="Listing text" />);
    expect(screen.getByRole("textbox", { name: "Listing text" }).tagName).toBe("TEXTAREA");
  });
});

describe("BottomTabBar and TopBar", () => {
  const items = [
    { id: "budget", label: "Budget", icon: <Icon name="wallet" /> },
    { id: "wally", label: "Wally", icon: <Icon name="chat" /> },
    { id: "receipts", label: "Receipts", icon: <Icon name="receipt" /> },
    { id: "proof", label: "Proof", icon: <Icon name="shieldCheck" /> },
  ];

  it("is a named navigation landmark that marks the current tab and puts Ask in the middle", async () => {
    const onPress = vi.fn();
    const onSelect = vi.fn();
    render(<BottomTabBar label="Main" items={items} current="wally" onSelect={onSelect} center={{ label: "Ask", icon: <Icon name="chat" />, onPress }} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const buttons = [...nav.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(["Budget", "Wally", "Ask", "Receipts", "Proof"]);
    expect(screen.getByRole("button", { name: "Wally" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Budget" })).not.toHaveAttribute("aria-current");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await userEvent.click(screen.getByRole("button", { name: "Proof" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("proof");
  });

  it("renders links when items have href", () => {
    render(<BottomTabBar label="Main" items={[{ ...items[0]!, href: "#/budget" }]} current="budget" />);
    expect(screen.getByRole("link", { name: "Budget" })).toHaveAttribute("aria-current", "page");
  });

  it("TopBar has a level-1 heading and a back button named in the current language", async () => {
    const onBack = vi.fn();
    render(<LocaleProvider locale="zh-HK"><TopBar title="證明" onBack={onBack} /></LocaleProvider>);
    expect(screen.getByRole("heading", { level: 1, name: "證明" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
