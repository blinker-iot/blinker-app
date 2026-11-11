import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');

// Source contracts only: actual Groovy/Android execution belongs to the single
// matching build queue. Dynamic profile fixtures are covered by cloud-bc5 tests.
test('Gradle gates the independent network mode and file against old/private modes', () => {
  assert.match(gradle, /flag\('BLINKER_INITIAL_NETWORK_RECOVERY'\)/);
  assert.match(gradle, /\[candidate, recovery, network\]\.count \{ it \} > 1/);
  assert.match(gradle, /\(candidate \|\| recovery \|\| network\) && sealedFirst/);
  assert.match(gradle, /network \? 'initialNetworkAdmission' : null/);
  assert.match(gradle, /environmentVariable\('BLINKER_INITIAL_NETWORK_ADMISSION_FILE'\)/);
  assert.match(gradle, /if \(originalName != null \|\| networkName != null\)/);
  assert.match(gradle, /if \(network \? originalName != null : networkName != null\)/);
});

test('Gradle compares the exact two-part admission and original recovery coordinates', () => {
  assert.match(gradle, /admission\.keySet\(\) != \(\['originalRecovery', 'operation'\] as Set\)/);
  assert.match(gradle, /original\.keySet\(\) != originalFields/);
  const operation = gradle.match(/operation\.keySet\(\) != \(\[([\s\S]*?)\] as Set\)/);
  assert(operation);
  assert.deepEqual([...operation[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort(), [
    'contract', 'operationId', 'sourceLogicalDeviceId', 'targetLogicalDeviceId', 'expectedRoot', 'existingLocator',
    'expiresAt', 'origin', 'region', 'tenantId', 'ownerUserId', 'cloudCredentialVersion',
  ].sort());
  assert.match(gradle, /operation\.contract != 'blinker\.installed-key-initial-network\.v1'/);
  assert.match(gradle, /\.every \{ operation\[it\] == original\[it\] \}/);
  assert.match(gradle, /operation\.operationId == original\.intentId/);
  assert.match(gradle, /operation\.sourceLogicalDeviceId == operation\.targetLogicalDeviceId/);
  assert.match(gradle, /NOFOLLOW_LINKS/);
  assert.match(gradle, /maximumAdmissionSize = network \? 4096 : 2048/);
  assert.match(gradle, /source\.length\(\) > maximumAdmissionSize/);
});

test('network assets require WiFi-only registration and remain forbidden in ordinary builds', () => {
  assert.match(gradle, /profile == 'initialNetworkAdmission' && value != true/);
  assert.match(gradle, /checkpoint\.keySet\(\) != \(\[profile\] as Set\)/);
  assert.match(gradle, /profile in \['admission', 'initialNetworkAdmission'\] && !registry\.any/);
  assert.match(gradle, /it\.pkg == 'capacitor-wifiprov' && it\.classpath == 'com\.wifiprov\.capacitor\.WiFiProvPlugin'/);
  assert.match(gradle, /config\.plugins\.BlinkerBc5Checkpoint\[profile\] != admission/);
  assert.match(gradle, /name == 'preBetaBuild'\) dependsOn 'verifyCloudBetaConfig'/);
  assert.match(gradle, /name == 'preDebugBuild' \|\| name == 'preReleaseBuild'\) dependsOn 'verifyBc5CandidateDisabled'/);
  assert.match(gradle, /bc5AdmissionInput\(null\)/);
});
