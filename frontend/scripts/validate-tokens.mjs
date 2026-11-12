import {readFileSync} from 'node:fs';
const css=readFileSync('src/styles.css','utf8');
const hardcoded=css.match(/#[0-9a-fA-F]{3,8}/g)||[];
if(hardcoded.length){console.error(`Hay colores hardcoded en styles.css: ${hardcoded.join(', ')}`);process.exit(1)}
console.log('Token validation passed: component styles use semantic CSS variables.');
