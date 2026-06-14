import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const rivPath = resolve(root, "public/maestro_stickman.riv");
const wasmPath = resolve(root, "node_modules/@rive-app/canvas/rive.wasm");

const EXPECTED = {
  artboard: "Stickman",
  stateMachine: "StickmanMachine",
  input: "character_state",
  inputType: 56, // StateMachineInputType.Number
};

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function fail(message, details = "") {
  console.error(`Rive verification failed: ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

if (!existsSync(rivPath)) {
  fail(
    "missing public/maestro_stickman.riv",
    "Export the first piano-only Rive asset from Rive, then put it at public/maestro_stickman.riv.",
  );
}

if (!existsSync(wasmPath)) {
  fail("missing @rive-app/canvas/rive.wasm", "Run npm install before verifying Rive assets.");
}

const mod = await import("@rive-app/canvas");
const riveApi = mod.default ?? mod["module.exports"] ?? mod;
const { RiveFile, RuntimeLoader, StateMachineInputType } = riveApi;

RuntimeLoader.setWasmBinary(toArrayBuffer(readFileSync(wasmPath)));
RuntimeLoader.setWasmFallbackUrl(null);

const riveFile = new RiveFile({ buffer: toArrayBuffer(readFileSync(rivPath)) });
await riveFile.init().catch((error) => {
  fail("could not load public/maestro_stickman.riv", error?.message ?? String(error));
});

const file = riveFile.getInstance();
const artboards = [];
for (let i = 0; i < file.artboardCount(); i += 1) {
  const artboard = file.artboardByIndex(i);
  artboards.push(artboard);
}

const artboard = artboards.find((item) => item.name === EXPECTED.artboard);
if (!artboard) {
  fail(
    `missing Artboard "${EXPECTED.artboard}"`,
    `Found: ${artboards.map((item) => item.name).join(", ") || "(none)"}`,
  );
}

const stateMachines = [];
for (let i = 0; i < artboard.stateMachineCount(); i += 1) {
  stateMachines.push(artboard.stateMachineByIndex(i));
}

const stateMachine = stateMachines.find((item) => item.name === EXPECTED.stateMachine);
if (!stateMachine) {
  fail(
    `missing State Machine "${EXPECTED.stateMachine}" on Artboard "${EXPECTED.artboard}"`,
    `Found: ${stateMachines.map((item) => item.name).join(", ") || "(none)"}`,
  );
}

const runtime = await RuntimeLoader.awaitInstance();
const instance = new runtime.StateMachineInstance(stateMachine, artboard);
const inputs = [];
for (let i = 0; i < instance.inputCount(); i += 1) {
  const input = instance.input(i);
  inputs.push({ name: input.name, type: input.type, value: input.value });
}

const input = inputs.find((item) => item.name === EXPECTED.input);
if (!input) {
  fail(
    `missing numeric input "${EXPECTED.input}" on State Machine "${EXPECTED.stateMachine}"`,
    `Found: ${inputs.map((item) => `${item.name}:${item.type}`).join(", ") || "(none)"}`,
  );
}

const numberType = StateMachineInputType?.Number ?? EXPECTED.inputType;
if (input.type !== numberType) {
  fail(
    `input "${EXPECTED.input}" must be numeric`,
    `Found type ${input.type}; expected ${numberType}.`,
  );
}

console.log("Rive verification passed:");
console.log(`- Artboard: ${EXPECTED.artboard}`);
console.log(`- State Machine: ${EXPECTED.stateMachine}`);
console.log(`- Numeric Input: ${EXPECTED.input}`);
console.log(`- Inputs: ${inputs.map((item) => `${item.name}:${item.type}`).join(", ")}`);

for (const item of artboards) item.delete?.();
file.unref?.();
riveFile.cleanup?.();
