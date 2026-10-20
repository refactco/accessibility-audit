// Validates each schema in formats/ against the JSON Schema 2020-12 meta-schema,
// and each example in formats/examples/ against its schema.
// An example named <name>.json or <name>-<variant>.json uses <name>.schema.json.
// Run: npm run validate-formats
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const schemas = {};
let failed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json")).sort()) {
  const schema = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const ok = ajv.validateSchema(schema);
  console.log(`${ok ? "OK  " : "FAIL"} schema ${file}`);
  if (!ok) {
    failed++;
    console.log(JSON.stringify(ajv.errors, null, 1));
  }
  ajv.addSchema(schema);
  schemas[file] = schema;
}

const examplesDir = join(dir, "examples");
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith(".json")).sort()) {
  const name = file.replace(/\.json$/, "").split("-")[0];
  const schema = schemas[`${name}.schema.json`];
  if (!schema) {
    console.log(`SKIP ${file}: no schema named ${name}.schema.json`);
    continue;
  }
  const validate = ajv.getSchema(schema.$id);
  const data = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
  const ok = validate(data);
  console.log(`${ok ? "OK  " : "FAIL"} example ${file} against ${name}.schema.json`);
  if (!ok) {
    failed++;
    console.log(JSON.stringify(validate.errors, null, 1));
  }
}

// The proposed settings of the pilot sites use the config schema.
const pilotsDir = join(dir, "..", "pilots");
const validateConfig = ajv.getSchema(schemas["config.schema.json"].$id);
for (const file of readdirSync(pilotsDir).filter((f) => f.endsWith(".config.json")).sort()) {
  const data = JSON.parse(readFileSync(join(pilotsDir, file), "utf8"));
  const ok = validateConfig(data);
  console.log(`${ok ? "OK  " : "FAIL"} pilot settings ${file} against config.schema.json`);
  if (!ok) {
    failed++;
    console.log(JSON.stringify(validateConfig.errors, null, 1));
  }
}

console.log(failed ? `\n${failed} failure(s)` : "\nAll schemas, examples, and pilot settings are valid.");
process.exit(failed ? 1 : 0);
