import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { compile } from "../src/compile.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "extension/images");
mkdirSync(outDir, { recursive: true });

const samples = [
  { file: "samples/order-placed.storm", name: "place-order" },
  { file: "samples/create-client.storm", name: "create-client" },
];

for (const sample of samples) {
  const source = readFileSync(join(root, sample.file), "utf8");
  const compiled = compile(source, { xmlHeader: true });
  const svgPath = join(outDir, `${sample.name}.svg`);
  const pngPath = join(outDir, `${sample.name}.png`);
  writeFileSync(svgPath, compiled.svg);
  const png = new Resvg(compiled.svg, {
    fitTo: { mode: "width", value: 1600 },
    background: "#fff8e7",
  }).render();
  writeFileSync(pngPath, png.asPng());
  console.log(pngPath, png.width, "x", png.height);
}
