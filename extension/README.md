# EventStorm

Event Storming as code. Open `.storm` files like `.mmd`: Storm source beside a live paper-note board. `eventstorm` fences also render inside Markdown preview.

## Install

Search **EventStorm** in the Extensions view (`Cmd+Shift+X`) in Cursor or VS Code, then install `fangkittipat.eventstorm`.

Cursor uses [Open VSX](https://open-vsx.org/extension/fangkittipat/eventstorm). VS Code uses the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=fangkittipat.eventstorm).

## `.storm` files

The EventStorm equivalent of a `.mmd` file is **`.storm`**. Opening one uses the EventStorm editor: Storm on the left, live board on the right (Split / Board, pan and zoom). **EventStorm: Open Source** reopens it as plain text.

```storm
eventstorming "Place order"
path "checkout"
  actor Shopper
  command "Place order"
  system Checkout
  event "Order placed"
```

## Markdown preview

Fence languages: `eventstorm`, `storm`, `eventstorming`.

Use **Markdown: Open Preview to the Side** (`Cmd+K V`), or the EventStorm preview icon in the editor title bar.

````markdown
```eventstorm
eventstorming "Place order"
path "checkout"
  actor Shopper
  command "Place order"
  system Checkout
  event "Order placed"
```
````

**EventStorm: Open Board Only** shows just the sticky boards, without the surrounding Markdown.

Cursor’s **Preview | Markdown** toggle is a different renderer and only special-cases Mermaid, so Storm fences stay as code there.

## Export

This does not render `eventstorm` fences in Cursor Chat, GitHub, or Cursor’s native Preview tab. Export an image instead: **EventStorm: Export SVG** or **EventStorm: Export PNG** (command palette, editor title bar, or the SVG / PNG buttons on the board). The save dialog defaults to the same folder as the `.storm` or Markdown file, so you can embed `![board](place-order.png)`.

## Storm

Keywords, indented under a `path`:

| Keyword | Sticky |
|---|---|
| `actor` | yellow — person/role, immediately before the command |
| `command` | blue — intention, present tense |
| `system` | pink — thing acted on |
| `event` | orange — fact, past tense |
| `read` | green — information for a decision; caption with `: "why"` |
| `policy auto` / `policy person` | purple — reaction after an event |
| `hotspot` | red — open question |
| `branch` | parallel alternative after an event |

## Repository

Source, playground, and samples: [github.com/fangkittipat/eventstorming](https://github.com/fangkittipat/eventstorming)
