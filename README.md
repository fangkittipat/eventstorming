# EventStorm

Event Storming as code: a Storm DSL and a paper-note board. Live playground, and Markdown preview in Cursor/VS Code.

## Playground

```bash
npm install
npm run dev
```

Open http://localhost:5173/. Type Storm on the left; the board updates on the right.

The EventStorm equivalent of a `.mmd` file is **`.storm`**. Opening `samples/order-placed.storm` uses the EventStorm editor: Storm source on the left, live paper board on the right (Split / Board, pan and zoom). **EventStorm: Open Source** reopens it as plain text.

## Ask the agent

In this repo the agent already knows Storm. In a new chat, say what happened in the process — you do not need to name the keywords.

Examples:

- Eventstorm checkout: a shopper places an order, stock is reserved automatically, and ops may release it to the warehouse.
- Storm the "name already exists" path for creating a client, including a hotspot.
- Add an `eventstorm` fence to `docs/place-order.md` for refunds.

It should write a `.storm` file or a ` ```eventstorm ` fence, then you preview with **Markdown: Open Preview to the Side** (`Cmd+K V`).

To use the same prompts in other repos, copy `.cursor/skills/eventstorm/` to `~/.cursor/skills/eventstorm/`.

## Markdown preview (Cursor / VS Code)

`eventstorm` fences render **inside the Markdown preview**, next to the rest of the page — same idea as Mermaid.

Use **Markdown: Open Preview to the Side** (`Cmd+K V`), or the EventStorm preview icon in the editor title bar. That is VS Code's Markdown preview, which our extension can hook.

Cursor's **Preview | Markdown** toggle in the editor is a different renderer. It only special-cases Mermaid, so Storm fences stay as code there. We cannot plug into that tab.

Fence languages: `eventstorm`, `storm`, `eventstorming`.

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

### Install the preview extension

From the repo root:

```bash
npm install
npm run extension:package
```

Then **Install from VSIX…** and pick `extension/eventstorm-0.1.6.vsix`, and reload the window.

**EventStorm: Open Board Only** shows just the sticky boards, without the surrounding Markdown.

This does **not** render `eventstorm` fences in Cursor Chat, GitHub, or Cursor's native Preview tab. Export an image from the extension instead: **EventStorm: Export SVG** or **EventStorm: Export PNG** (command palette, editor title bar, or the SVG / PNG buttons on the board). The save dialog defaults to the same folder as the `.storm` or Markdown file, so you can embed `![board](place-order.png)`.
