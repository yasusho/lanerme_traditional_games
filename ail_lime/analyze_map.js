const fs = require('fs');

const svgContent = fs.readFileSync('map.svg', 'utf8');

const width = 297;
const height = 210;

function parseTransform(transformStr) {
    let x = 0, y = 0;
    if (!transformStr) return { x, y };
    const translateMatch = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transformStr);
    if (translateMatch) {
        x += parseFloat(translateMatch[1]);
        y += parseFloat(translateMatch[2]);
    }
    const matrixMatch = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transformStr);
    if (matrixMatch) {
        x += parseFloat(matrixMatch[1]);
        y += parseFloat(matrixMatch[2]);
    }
    return { x, y };
}

function getAttr(attrStr, name) {
    const regex = new RegExp(`${name}\\s*=\\s*"([^"]+)"`);
    const match = regex.exec(attrStr);
    return match ? match[1] : null;
}

function isIgnored(stack) {
    return stack.some(tag => tag === 'flowRoot' || tag === 'defs' || tag === 'flowRegion');
}

const tagRegex = /<(\/?)(flowRoot|flowRegion|defs|g|circle|rect|text|tspan|path)([^>]*?)(\/?)>/g;

const transformStack = [{ x: 0, y: 0 }];
const tagStack = [];
const shapes = [];
const texts = [];
let currentText = null;

let match;
while ((match = tagRegex.exec(svgContent)) !== null) {
    const isClosing = match[1] === '/';
    const tagType = match[2];
    const attrs = match[3];
    const isSelfClosing = match[4] === '/';

    const currentTransform = transformStack[transformStack.length - 1];

    if (tagType === 'g' || tagType === 'flowRoot' || tagType === 'defs' || tagType === 'flowRegion') {
        if (!isClosing) {
            tagStack.push(tagType);
            const t = parseTransform(getAttr(attrs, 'transform'));
            transformStack.push({
                x: currentTransform.x + t.x,
                y: currentTransform.y + t.y
            });
            if (isSelfClosing) {
                tagStack.pop();
                transformStack.pop();
            }
        } else {
            if (tagStack.length > 0) tagStack.pop();
            if (transformStack.length > 1) transformStack.pop();
        }
    } else if (tagType === 'circle' && !isClosing && !isIgnored(tagStack)) {
        let cx = parseFloat(getAttr(attrs, 'cx') || getAttr(attrs, 'sodipodi:cx'));
        let cy = parseFloat(getAttr(attrs, 'cy') || getAttr(attrs, 'sodipodi:cy'));
        const r = parseFloat(getAttr(attrs, 'r'));
        if (!isNaN(cx) && !isNaN(cy) && r > 1 && r < 20) {
            shapes.push({
                type: 'circle',
                x: cx + currentTransform.x,
                y: cy + currentTransform.y,
                r: r
            });
        }
    } else if (tagType === 'rect' && !isClosing && !isIgnored(tagStack)) {
        let x = parseFloat(getAttr(attrs, 'x'));
        let y = parseFloat(getAttr(attrs, 'y'));
        let w = parseFloat(getAttr(attrs, 'width'));
        let h = parseFloat(getAttr(attrs, 'height'));
        if (!isNaN(x) && !isNaN(y) && w < 25 && h < 25 && w > 1 && h > 1) { // Relaxed Rect filters
            shapes.push({
                type: 'rect',
                x: x + currentTransform.x + (w / 2),
                y: y + currentTransform.y + (h / 2)
            });
        }
    } else if (tagType === 'text' && !isIgnored(tagStack)) {
        if (!isClosing) {
            let x = parseFloat(getAttr(attrs, 'x'));
            let y = parseFloat(getAttr(attrs, 'y'));
            if (!isNaN(x) && !isNaN(y)) {
                currentText = {
                    x: x + currentTransform.x,
                    y: y + currentTransform.y,
                    content: ''
                };
            }
        } else {
            if (currentText && currentText.content) texts.push(currentText);
            currentText = null;
        }
    } else if (tagType === 'tspan' && !isIgnored(tagStack)) {
        if (!isClosing && currentText) {
            const contentEnd = svgContent.indexOf('<', tagRegex.lastIndex);
            if (contentEnd > tagRegex.lastIndex) {
                const content = svgContent.substring(tagRegex.lastIndex, contentEnd).trim();
                if (content) currentText.content += content;
            }
        }
    }
}

const mapNodeNames = [
    { id: 'Makati', search: 'makati' },
    { id: 'Kuwake', search: 'kuwake' },
    { id: 'Kukeka', search: 'kukeka' },
    { id: 'Ikkijau', search: 'ikkijau' },
    { id: 'Taupo', search: 'taupo' },
    { id: 'Xep-Okijau', search: 'xep' },
    { id: 'Pacilxalija', search: 'pacil' },
    { id: 'Kutija', search: 'kutija' },
    { id: 'Nanala', search: 'nanala' },
    { id: 'Inuci', search: 'inuci' },
    { id: 'Spukebec', search: 'cupukebec' },
    { id: 'Atalan', search: 'atalan' },
    { id: 'Aikit', search: 'aikit' },
    { id: 'Pede', search: 'pede' }
];

const results = {};

mapNodeNames.forEach(node => {
    const label = texts.find(t => t.content.toLowerCase().includes(node.search));
    if (label) {
        let bestShape = null;
        let minDist = Infinity;

        shapes.forEach(shape => {
            const dy = shape.y - label.y;
            const dx = shape.x - label.x;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 80 && dist < minDist) { // Relaxed distance
                minDist = dist;
                bestShape = shape;
            }
        });

        if (bestShape) {
            const finalX = (bestShape.x / width) * 100;
            const finalY = (bestShape.y / height) * 100;
            results[node.id] = { x: finalX.toFixed(1), y: finalY.toFixed(1) };
        } else {
            console.error(`No shape for ${node.id}`);
        }
    } else {
        console.error(`Label missing for ${node.id}`);
    }
});

console.log(JSON.stringify(results, null, 2));
