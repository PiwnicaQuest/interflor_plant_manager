const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = '/home/polflor/PlantManager/web-panel/public';

async function convertSvgToPng(svgPath, outputPath, size) {
  try {
    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Created ${outputPath}`);
  } catch (err) {
    console.error(`Error converting ${svgPath}:`, err);
  }
}

async function main() {
  const iconSvg = path.join(publicDir, 'polflor-icon.svg');

  // Create PWA icons in various sizes
  await convertSvgToPng(iconSvg, path.join(publicDir, 'polflor-icon-180.png'), 180);
  await convertSvgToPng(iconSvg, path.join(publicDir, 'polflor-icon-192.png'), 192);
  await convertSvgToPng(iconSvg, path.join(publicDir, 'polflor-icon-512.png'), 512);

  console.log('Done!');
}

main();
