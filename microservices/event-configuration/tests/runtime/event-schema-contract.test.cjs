const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const root = path.resolve(__dirname, '../../contracts/configuration');
for (const name of ['configuration.event.release_published.v1', 'configuration.event.cancelled.v1']) {
  test(`${name}: schema valida ejemplo y rechaza evento sin organización`, () => {
    const read = (kind) => JSON.parse(fs.readFileSync(path.join(root, kind, `${name}.json`), 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(read('schemas'));
    const example = read('examples');
    assert.equal(validate(example), true, JSON.stringify(validate.errors));
    delete example.organization_id;
    assert.equal(validate(example), false);
  });
}
