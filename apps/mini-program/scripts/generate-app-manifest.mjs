import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const manifestPath = sourceArgument
  ? path.resolve(packageRoot, sourceArgument.slice("--source=".length))
  : path.join(packageRoot, "src", "app.json");
const outputPath = outputArgument
  ? path.resolve(packageRoot, outputArgument.slice("--output=".length))
  : path.join(packageRoot, "dist", "app.json");
const productionMode = process.argv.includes("--production");
const diagnosticsPage = "pages/wifi-diagnostics/index";

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const regularPages = manifest.pages.filter((page) => page !== diagnosticsPage);
manifest.pages = productionMode ? ["pages/connect/index"] : [...regularPages, diagnosticsPage];
const { pages, ...manifestWithoutPages } = manifest;
const source = JSON.stringify(manifestWithoutPages, null, 2).replace(
  "{\n",
  `{\n  "pages": ${JSON.stringify(pages)},\n`,
);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${source}\n`, "utf8");
process.stdout.write(
  `Generated ${path.relative(packageRoot, outputPath)} for ${
    productionMode ? "production" : "develop/trial"
  } mode\n`,
);
