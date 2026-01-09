const sharp = require('sharp');
const path = require('path');

const publicDir = '/home/polflor/PlantManager/web-panel/public';
const logoPath = path.join(publicDir, 'polflor-logo.png');

async function main() {
  try {
    // Get original image info
    const metadata = await sharp(logoPath).metadata();
    console.log('Original size:', metadata.width, 'x', metadata.height);

    // Create square icon versions (centered with padding if needed)
    const sizes = [180, 192, 512];
    
    for (const size of sizes) {
      await sharp(logoPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toFile(path.join(publicDir, `polflor-icon-${size}.png`));
      console.log(`Created polflor-icon-${size}.png`);
    }

    // Create a favicon version (32x32)
    await sharp(logoPath)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(path.join(publicDir, 'favicon.png'));
    console.log('Created favicon.png');

    console.log('Done!');
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
