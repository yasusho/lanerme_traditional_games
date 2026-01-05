const fs = require('fs');
const path = 'simulator/game.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

let nestedStart = -1;
// Start looking after line 100 to avoid the first one
for (let i = 100; i < lines.length; i++) {
    if (lines[i].trim().startsWith('class Game {')) {
        nestedStart = i;
        break;
    }
}

if (nestedStart === -1) {
    console.error("Could not find nested class Game");
    process.exit(1);
}

// Determine indentation to strip
const startLine = lines[nestedStart];
const indentMatch = startLine.match(/^(\s+)/);
const indentToRemove = indentMatch ? indentMatch[1] : '';

console.log(`Found nested class at line ${nestedStart + 1}. stripping indent: '${indentToRemove}'`);

const newLines = lines.slice(nestedStart).map(line => {
    if (line.startsWith(indentToRemove)) {
        return line.substring(indentToRemove.length);
    }
    return line; // specialized logic for lines that might be empty or less indented?
});

fs.writeFileSync(path, newLines.join('\n'));
console.log(`Fixed game.js!`);
