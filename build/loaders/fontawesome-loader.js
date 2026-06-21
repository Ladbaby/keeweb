const fs = require('fs');
const path = require('path');

const SVGIcons2SVGFontStream = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const wawoff2 = require('wawoff2');

const svgBaseDir = path.resolve('node_modules/@fortawesome/fontawesome-free/svgs/');
const svgDirs = ['brands', 'regular', 'solid']
    .map((dir) => path.join(svgBaseDir, dir))
    .concat('graphics/svg');

const allIcons = {};

for (const svgDir of svgDirs) {
    const suffix = svgDir.endsWith('regular') ? '-o' : '';
    fs.readdirSync(path.join(svgDir))
        .filter((icon) => icon.endsWith('.svg'))
        .forEach((icon) => {
            const svgIconPath = path.join(svgDir, icon);
            const iconName = icon.substr(0, icon.length - 4) + suffix;
            allIcons[iconName] = svgIconPath;
        });
}

module.exports = function makeFontAwesomeWoff2() {
    const callback = this.async();
    if (this.cacheable) {
        this.cacheable();
    }

    const iconFontScssPath = path.resolve('app/styles/base/_icon-font.scss');
    this.addDependency(iconFontScssPath);

    fs.readFile(iconFontScssPath, 'utf-8', async (err, scssSource) => {
        if (err) {
            return callback(err);
        }
        process.stdout.write('Building fontawesome.woff2... ');
        const startTime = Date.now();
        try {
            const { fontData, iconsCount } = await buildFont(this, scssSource);
            const kb = (fontData.byteLength / 1024).toFixed(2);
            const time = Date.now() - startTime;
            process.stdout.write(`ok: ${time}ms, ${iconsCount} icons, ${kb} KiB\n`);
            const fontCss = fontData.toString('base64');
            callback(null, `module.exports = "data:font/woff2;base64,${fontCss}"`);
        } catch (ex) {
            process.stdout.write('error\n');
            callback(ex);
        }
    });
};

// Icon alias mapping: FA5 icon names that were removed/renamed in FA6
// Maps old icon names to their FA6 replacement SVG names
const ICON_ALIASES = {
    'sort-alpha-down': 'sort-down',
    'sort-alpha-down-alt': 'sort-up',
    'sort-numeric-down': 'sort-down',
    'sort-numeric-down-alt': 'sort-up',
    'sort-amount-down': 'sort-down',
    'level-down-alt': 'arrow-down-wide-short',
    onedrive: 'cloud'
};

function buildFont(loader, scssSource) {
    const includedIcons = {};
    const includedIconList = [...scssSource.matchAll(/[\r\n]+[$]fa-var-([\w-]+):/g)].map(
        ([, name]) => name
    );
    for (const iconName of includedIconList) {
        if (includedIcons[iconName]) {
            throw new Error(`Duplicate icon: $fa-var-${iconName}`);
        }
        const resolvedName = ICON_ALIASES[iconName] || iconName;
        if (!allIcons[resolvedName]) {
            throw new Error(
                `Icon not found: "${iconName}"${ICON_ALIASES[iconName] ? '' : ' - check icon name'}`
            );
        }
        includedIcons[iconName] = true;
    }

    const fontStream = new SVGIcons2SVGFontStream({
        fontName: 'Font Awesome 6 Free',
        round: 10e12,
        log() {}
    });

    const fontData = [];
    fontStream.on('data', (chunk) => fontData.push(chunk));

    let charCode = 0xf000;
    for (const iconName of includedIconList) {
        ++charCode;
        const resolvedName = ICON_ALIASES[iconName] || iconName;
        const svgIconPath = allIcons[resolvedName];

        loader.addDependency(svgIconPath);

        const glyph = fs.createReadStream(svgIconPath);
        glyph.metadata = { name: iconName, unicode: [String.fromCharCode(charCode)] };

        fontStream.write(glyph);
    }
    fontStream.end();

    return new Promise((resolve, reject) => {
        fontStream.on('end', async () => {
            try {
                let data = Buffer.concat(fontData);
                data = Buffer.from(svg2ttf(data.toString('utf8')).buffer);
                data = Buffer.from(await wawoff2.compress(data));

                resolve({ fontData: data, iconsCount: includedIconList.length });
            } catch (ex) {
                reject(ex);
            }
        });
    });
}

module.exports.raw = true;
