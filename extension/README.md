# EventStorm

Event Storming as code. Open a `.storm` file like any other source file. Preview the paper-note board with **EventStorm: Preview**. Edit the source with **EventStorm: Storm**. The same boards also render inside VS Code’s Markdown preview.

![EventStorm editor with Storm source and sticky board](https://raw.githubusercontent.com/fangkittipat/eventstorming/main/extension/images/editor.png)

## Open Preview / Storm

A `.storm` file always opens as **source** (plain text), like any other code file.

Cursor’s purple **Preview | Markdown** pills exist only for `.md` files. They cannot appear for `.storm`. Use EventStorm’s own commands instead:

| You want | Do this |
|---|---|
| See the board | Command Palette (`Cmd+Shift+P`) → **EventStorm: Preview** |
| Edit the Storm source | Command Palette → **EventStorm: Storm** |
| Board beside the file | **EventStorm: Open Preview to the Side** |

Shortcuts while a `.storm` file is focused:

- Click **Preview** on the first line of the file
- Click **Preview** or **Storm** in the status bar (bottom right)

On the board: drag to pan, scroll to pan, **Cmd/Ctrl + scroll** or **− / % / +** to zoom.

## Example

Write this:

```storm
eventstorming "Place order"
path "checkout"
  actor Shopper
  command "Place order"
  aggregate Order
  event "Order placed"
  branch
    policy auto "whenever order placed, reserve stock"
    command "Reserve stock"
    aggregate Inventory
    event "Stock reserved"
  branch
    policy person "ops checks the order"
    actor Ops
    command "Release to warehouse"
    system Warehouse
    event "Order released"
```

Get this board:

![Place order EventStorm board](https://raw.githubusercontent.com/fangkittipat/eventstorming/main/extension/images/place-order.png)

Happy path vs reject path:

![Create client EventStorm board](https://raw.githubusercontent.com/fangkittipat/eventstorming/main/extension/images/create-client.png)

## Features

- **`.storm` preview** — Command Palette **EventStorm: Preview** / **EventStorm: Storm**; pan, zoom, and wrap long sticky text
- **Markdown preview** — `eventstorm`, `storm`, and `eventstorming` fences render next to the rest of the page
- **Export** — SVG or PNG from the command palette or editor title bar

## Markdown

Storm boards in a Markdown file use VS Code’s Markdown preview, not Cursor’s **Preview | Markdown** toggle.

- **Markdown: Open Preview to the Side** (`Cmd+K V`)
- Cursor’s **Preview | Markdown** pills only special-case Mermaid, so Storm fences stay as code there

````markdown
```eventstorm
eventstorming "Place order"
path "checkout"
  actor Shopper
  command "Place order"
  aggregate Order
  event "Order placed"
```
````

## Language

Indent the path body. Quotes are optional for a single word.

| Keyword | Sticky | Meaning |
|---|---|---|
| `actor` | yellow | Person or role, immediately before the command |
| `command` | blue | Intention, present tense |
| `aggregate` | light yellow | Domain consistency boundary, between command and event |
| `system` | pink | External system or other bounded context |
| `event` | orange | Fact, past tense |
| `read` | green | Information for a decision; caption with `: "why"` |
| `policy auto` / `policy person` | purple | Reaction after an event |
| `hotspot` | red | Open question |
| `branch` | — | Parallel alternative after an event |
| `value+` / `value-` | marker | Attach to the sticky above |

Basic unit: **read → actor → command → aggregate → event**. Use `system` when the thing acted on is outside this domain.

## Commands

| Command | What it does |
|---|---|
| EventStorm: Preview | Show the board in this editor (like Markdown preview) |
| EventStorm: Storm | Show the `.storm` source |
| EventStorm: Open Preview to the Side | Board in a split editor |
| EventStorm: Export SVG / PNG | Save next to the current file |

## Install

Search **EventStorm** in the Extensions view (`Cmd+Shift+X`) and install `fangkittipat.eventstorm`.

Source, playground, and more samples: [github.com/fangkittipat/eventstorming](https://github.com/fangkittipat/eventstorming)
