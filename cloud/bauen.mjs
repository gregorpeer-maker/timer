// Baut cloud/functions/erinnerungen/index.ts: setzt erinnerung.js in die Vorlage ein.
// Aufruf: node cloud/bauen.mjs   (nach jeder Änderung an erinnerung.js oder vorlage.ts)
import { readFileSync, writeFileSync } from 'node:fs';
const hier = new URL('.', import.meta.url);
const vorlage = readFileSync(new URL('functions/erinnerungen/vorlage.ts', hier), 'utf8');
const logik = readFileSync(new URL('../erinnerung.js', hier), 'utf8');
if (!vorlage.includes('/*ERINNERUNG_JS*/')) throw new Error('Platzhalter fehlt in vorlage.ts');
writeFileSync(new URL('functions/erinnerungen/index.ts', hier), vorlage.replace('/*ERINNERUNG_JS*/', () => logik.split('\n').map(z => z ? '  ' + z : z).join('\n')));
console.log('cloud/functions/erinnerungen/index.ts gebaut');
