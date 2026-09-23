const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assetsDir = path.join(__dirname, '..', 'assets');
const standardSvg = path.join(assetsDir, 'icon.svg');
const maskableSvg = path.join(assetsDir, 'icon-maskable.svg');

async function generateIcons() {
  console.log('[PWA Icon Generator] Generating high-resolution PWA icons...');

  const targets = [
    { input: standardSvg, output: 'icon-512.png', size: 512 },
    { input: standardSvg, output: 'icon-192.png', size: 192 },
    { input: maskableSvg, output: 'icon-maskable.png', size: 512 },
    { input: standardSvg, output: 'apple-touch-icon.png', size: 180 },
    { input: standardSvg, output: 'favicon-32.png', size: 32 },
    { input: standardSvg, output: 'favicon-16.png', size: 16 }
  ];

  for (const target of targets) {
    const outputPath = path.join(assetsDir, target.output);
    await sharp(target.input)
      .resize(target.size, target.size)
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(outputPath);
    console.log(`✓ Generated ${target.output} (${target.size}x${target.size})`);
  }

  console.log('[PWA Icon Generator] All PWA icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
