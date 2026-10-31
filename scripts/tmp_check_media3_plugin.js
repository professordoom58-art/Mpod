const fs = require('fs');
const path = require('path');
const { applyMedia3Resolution, applyRetrieverKotlinPin } = require('../plugins/withMedia3Resolution');

const file = path.join(__dirname, '..', 'android', 'build.gradle');
const live = fs.readFileSync(file, 'utf8');
const run = (s) => applyRetrieverKotlinPin(applyMedia3Resolution(s));

const once = run(live);
const twice = run(once);
const thrice = run(twice);

const checks = [
  ['plugin is idempotent', once === twice && twice === thrice],
  ['one root block', (once.match(/BEGIN ipod-player media3 dedupe \(root\)/g) || []).length === 1],
  ['one retriever block', (once.match(/BEGIN ipod-player media3 dedupe \(retriever module\)/g) || []).length === 1],
  ['extractor substitution present', once.includes("substitute module('com.github.MissingCore.media:media3-extractor') using module('androidx.media3:media3-extractor:1.9.3')")],
  ['fork group redirected', once.includes("details.useTarget \"androidx.media3:${details.requested.name}:1.9.3\"")],
  ['retriever kotlin pin present', once.includes("kotlin-stdlib:${rootProject.ext.kotlinVersion}")],
  ['retriever block before allprojects', once.indexOf('retriever module)') < once.indexOf('allprojects {')],
  ['blocks inside allprojects/stay in order', once.indexOf('allprojects {') < once.indexOf('dedupe (root)')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

fs.writeFileSync(path.join(__dirname, '..', 'tmp-plugout.gradle'), once, 'utf8');
console.log(once === twice ? 'stable output written to tmp-plugout.gradle' : 'UNSTABLE output written to tmp-plugout.gradle');
process.exitCode = failed ? 1 : 0;
