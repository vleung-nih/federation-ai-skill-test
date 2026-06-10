import fs from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const folderA = process.argv[2];
const folderB = process.argv[3];
const outputJson = process.argv[4] || 'report.json';

if (!folderA || !folderB) {
    console.log(
        'Usage: node compare-images.mjs folderA folderB report.json'
    );
    process.exit(1);
}

function listImages(folder) {
    return fs.readdirSync(folder)
        .filter(f => /\.(png)$/i.test(f));
}

const filesA = new Set(listImages(folderA));
const filesB = new Set(listImages(folderB));

const common = [...filesA].filter(f => filesB.has(f));

const report = {
    summary: {
        compared: 0,
        identical: 0,
        different: 0,
        missingInA: [],
        missingInB: []
    },
    results: []
};

for (const f of filesA) {
    if (!filesB.has(f)) {
        report.summary.missingInB.push(f);
    }
}

for (const f of filesB) {
    if (!filesA.has(f)) {
        report.summary.missingInA.push(f);
    }
}

for (const file of common) {

    const img1 = PNG.sync.read(
        fs.readFileSync(path.join(folderA, file))
    );

    const img2 = PNG.sync.read(
        fs.readFileSync(path.join(folderB, file))
    );

    const sameSize =
        img1.width === img2.width &&
        img1.height === img2.height;

    let diffPixels = null;
    let identical = false;

    if (sameSize) {

        diffPixels = pixelmatch(
            img1.data,
            img2.data,
            null,
            img1.width,
            img1.height,
            {
                threshold: 0.1
            }
        );

        identical = diffPixels === 0;
    }

    report.summary.compared++;

    if (identical) {
        report.summary.identical++;
    } else {
        report.summary.different++;
    }

    report.results.push({
        file,
        identical,
        sameSize,
        widthA: img1.width,
        heightA: img1.height,
        widthB: img2.width,
        heightB: img2.height,
        diffPixels
    });

    console.log(
        `${file}: ${identical ? 'IDENTICAL' : 'DIFFERENT'}`
    );
}

fs.writeFileSync(
    outputJson,
    JSON.stringify(report, null, 2)
);

console.log(`Saved report to ${outputJson}`);