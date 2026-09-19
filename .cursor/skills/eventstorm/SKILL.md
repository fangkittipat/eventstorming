---
name: eventstorm
description: >-
  Write EventStorming process-modelling boards in Storm DSL (.storm files or
  ```eventstorm markdown fences). In Cursor chat, also emit a mermaid flowchart
  of the same flow so it renders in the agent window. Use when the user says
  eventstorm, storm this process, map a workflow as events/commands/policies,
  or asks for a sticky-note board.
---

# EventStorm DSL

Model a business process as a left-to-right sticky board in **Storm**, this repo's language. Never use Mermaid, PlantUML, or ASCII boxes.

## What to produce

- A `.storm` file under `samples/` or `docs/` for the IDE EventStorm editor
- In **this Cursor agent/chat window**, also include a `mermaid` flowchart of the same flow so it renders here. Cursor chat only special-cases Mermaid; `eventstorm` fences stay as code in the agent pane.

Never use Mermaid as the source of truth. Storm is the source. Mermaid is the chat preview.

If the user did not name a file, write the `.storm` (or a fence) and put the mermaid in the reply.

## Grammar

```storm
eventstorming "Title"
note "Optional one-liner"

path "happy path"
  read "Cart" : "ready to buy"
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
    read "Open orders"
    command "Release to warehouse"
    system Warehouse
    event "Order released"
  hotspot "What if stock reservation fails?"
```

Keywords (indent the path body):

| Keyword | Sticky | Notes |
|---|---|---|
| `actor` | yellow | Person/role. Put immediately before the command (or after `policy person`). Several actors cascade. |
| `command` | blue | Intention, present tense. Needs an actor or policy before it. |
| `aggregate` | light yellow | Domain consistency boundary that handles the command. Sit it between command and event. |
| `system` | pink | External system or other bounded context. |
| `event` | orange | Fact, past tense. Needs a command before it. |
| `read` | green | Information for a decision. Caption with `: "why they look"`. Sit it before actor/command. |
| `policy auto` | purple | Automatic reaction to an event. |
| `policy person` | purple | Person decides; follow with `actor`. |
| `hotspot` | red | Open question. Do not silently resolve. |
| `none` | grey | Explicit no-op outcome. |
| `value+` / `value-` | marker | Attach to the sticky above. |
| `branch` | — | Parallel alternative; stack consecutive `branch` blocks after an event. |

Quotes optional for a single word (`actor Shopper`). Use quotes for phrases.

## Modelling rules

1. Basic unit: **read → actor → command → aggregate → event**. Use `system` (pink) when the thing acted on is outside this domain.
2. After an event, ask "does this trigger a policy?" If several independent reactions, one `branch` per policy.
3. Events are facts that happened. Commands are intentions. Do not mix.
4. Surface ambiguity as `hotspot`, do not invent a resolution.
5. End in a stable event (and a read model if someone needs to see the result).
6. Names in business language: "Order placed", not `OrderPlacedEvent`.

Copy shape from `samples/order-placed.storm` (fan-out policies) and `samples/create-client.storm` (happy vs reject path).
