import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../public/i18n/', import.meta.url);
const languages = JSON.parse(readFileSync(new URL('i18n.json', root), 'utf8'));

test('all existing language dictionaries cover grouped profile and recoverable settings errors', () => {
  for (const { code } of languages) {
    const dictionary = JSON.parse(readFileSync(new URL(`${code}/${code}.json`, root), 'utf8'));
    for (const [group, key] of [
      ['PROFILE', 'DEVICE_MANAGEMENT'], ['PROFILE', 'CONNECTION_AND_SERVICES'],
      ['SETTINGS', 'LANGUAGE_SAVE_FAILED'], ['SETTINGS', 'REGION_CHANGE_FAILED'],
    ]) {
      assert.equal(typeof dictionary[group]?.[key], 'string', `${code}: ${group}.${key}`);
      assert.ok(dictionary[group][key].trim(), `${code}: ${group}.${key} must not be blank`);
    }
    assert.ok(dictionary.SETTINGS.SERVICE_REGION_HINT.trim(), `${code}: retain the region sign-in warning`);
  }
});
