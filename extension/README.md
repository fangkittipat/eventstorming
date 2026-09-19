# EventStorm

Event Storming as code. Open a `.storm` file to edit the source; the paper-note board opens beside it. The same boards also render inside Markdown preview.

![EventStorm editor with Storm source and sticky board](https://raw.githubusercontent.com/fangkittipat/eventstorming/main/extension/images/editor.png)

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

- **`.storm` editor** — split source and paper board, with pan and zoom
- **Markdown preview** — `eventstorm`, `storm`, and `eventstorming` fences render next to the rest of the page
- **Export** — SVG or PNG from the command palette, editor title bar, or board buttons
- **Open Board Only** — stickies without the surrounding Markdown

## Markdown

Use **Markdown: Open Preview to the Side** (`Cmd+K V`), or the EventStorm preview icon in the editor title bar.

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

Cursor’s **Preview | Markdown** toggle is a different renderer and only special-cases Mermaid, so Storm fences stay as code there.

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
| EventStorm: Open Preview | Markdown preview, or the `.storm` board beside the file |
| EventStorm: Open Board Only | Stickies only |
| EventStorm: Export SVG / PNG | Save next to the current file |

## Install

Search **EventStorm** in the Extensions view (`Cmd+Shift+X`) and install `fangkittipat.eventstorm`.

Source, playground, and more samples: [github.com/fangkittipat/eventstorming](https://github.com/fangkittipat/eventstorming)
