import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export type ImageSize = 'thumb' | 'medium' | 'full';

interface SizeConfig {
  width: number;
  height: number;
  quality: number;
}

const SIZE_CONFIGS: Record<ImageSize, SizeConfig> = {
  thumb: { width: 64, height: 64, quality: 80 },
  medium: { width: 256, height: 256, quality: 85 },
  full: { width: 800, height: 800, quality: 90 }
};

// Allowed external domains for security
const ALLOWED_DOMAINS = [
  'photo.freshportal.delivery',
  'beeldbankfotos.royalfloraholland.com',
  'p2.1ps.nl'
];

// Cache directory
const CACHE_DIR = path.join(__dirname, '../../uploads/cache');

// Cache TTL in days
const CACHE_TTL_DAYS = 7;

export class ImageService {
  
  /**
   * Ensure cache directory exists
   */
  private static ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Get cache path for a specific barcode and size
   */
  private static getCachePath(barcode: string, size: ImageSize): string {
    const sanitizedBarcode = barcode.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(CACHE_DIR, sanitizedBarcode, `${size}.webp`);
  }

  /**
   * Get cache directory for a specific barcode
   */
  private static getBarcodeDir(barcode: string): string {
    const sanitizedBarcode = barcode.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(CACHE_DIR, sanitizedBarcode);
  }

  /**
   * Check if cache file exists and is not expired
   */
  private static isCacheValid(cachePath: string): boolean {
    try {
      if (!fs.existsSync(cachePath)) return false;
      
      const stats = fs.statSync(cachePath);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      
      return ageDays < CACHE_TTL_DAYS;
    } catch {
      return false;
    }
  }

  /**
   * Fetch image from external URL
   */
  private static async fetchImage(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(url);
        
        // Security check
        if (!ALLOWED_DOMAINS.some(domain => parsedUrl.hostname.includes(domain))) {
          reject(new Error(`Domain not allowed: ${parsedUrl.hostname}`));
          return;
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        protocol.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            // Handle redirects
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              this.fetchImage(redirectUrl).then(resolve).catch(reject);
              return;
            }
          }
          
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        }).on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Process image with sharp and convert to WebP
   */
  private static async processImage(buffer: Buffer, size: ImageSize): Promise<Buffer> {
    const config = SIZE_CONFIGS[size];
    
    return sharp(buffer)
      .rotate()
      .resize(config.width, config.height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .webp({ quality: config.quality })
      .toBuffer();
  }

  /**
   * Get image for a barcode in specified size
   * Returns cached version if available, otherwise fetches and processes
   */
  static async getImage(barcode: string, size: ImageSize, sourceUrl?: string): Promise<Buffer | null> {
    this.ensureCacheDir();
    
    const cachePath = this.getCachePath(barcode, size);
    
    // Check if cached version exists and is valid
    if (this.isCacheValid(cachePath)) {
      try {
        return fs.readFileSync(cachePath);
      } catch {
        // Cache read failed, continue to fetch
      }
    }

    // Need to fetch and process
    if (!sourceUrl) {
      return null;
    }

    try {
      // Check if we have original cached
      const originalPath = path.join(this.getBarcodeDir(barcode), 'original');
      let originalBuffer: Buffer;

      if (fs.existsSync(originalPath)) {
        originalBuffer = fs.readFileSync(originalPath);
      } else {
        // Fetch from source
        originalBuffer = await this.fetchImage(sourceUrl);
        
        // Save original
        const barcodeDir = this.getBarcodeDir(barcode);
        if (!fs.existsSync(barcodeDir)) {
          fs.mkdirSync(barcodeDir, { recursive: true });
        }
        fs.writeFileSync(originalPath, originalBuffer);
      }

      // Process and cache
      const processedBuffer = await this.processImage(originalBuffer, size);
      fs.writeFileSync(cachePath, processedBuffer);
      
      return processedBuffer;
    } catch (error) {
      console.error(`[ImageService] Error processing image for ${barcode}:`, error);
      return null;
    }
  }

  /**
   * Pre-generate all sizes for a barcode
   */
  static async processAndCache(barcode: string, sourceUrl: string): Promise<boolean> {
    this.ensureCacheDir();
    
    try {
      // Fetch original
      const originalBuffer = await this.fetchImage(sourceUrl);
      
      // Save original
      const barcodeDir = this.getBarcodeDir(barcode);
      if (!fs.existsSync(barcodeDir)) {
        fs.mkdirSync(barcodeDir, { recursive: true });
      }
      fs.writeFileSync(path.join(barcodeDir, 'original'), originalBuffer);

      // Generate all sizes in parallel
      const sizes: ImageSize[] = ['thumb', 'medium', 'full'];
      await Promise.all(sizes.map(async (size) => {
        const processedBuffer = await this.processImage(originalBuffer, size);
        const cachePath = this.getCachePath(barcode, size);
        fs.writeFileSync(cachePath, processedBuffer);
      }));

      console.log(`[ImageService] Cached all sizes for barcode: ${barcode}`);
      return true;
    } catch (error) {
      console.error(`[ImageService] Error caching images for ${barcode}:`, error);
      return false;
    }
  }

  /**
   * Clean old cache files
   */
  static async cleanOldCache(): Promise<{ deleted: number; errors: number }> {
    this.ensureCacheDir();
    
    let deleted = 0;
    let errors = 0;
    const now = Date.now();
    const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

    try {
      const barcodeDirs = fs.readdirSync(CACHE_DIR);
      
      for (const dir of barcodeDirs) {
        const dirPath = path.join(CACHE_DIR, dir);
        
        try {
          const stats = fs.statSync(dirPath);
          if (!stats.isDirectory()) continue;

          // Check directory modification time
          if (now - stats.mtimeMs > ttlMs) {
            // Remove entire directory
            fs.rmSync(dirPath, { recursive: true, force: true });
            deleted++;
          }
        } catch (err) {
          console.error(`[ImageService] Error cleaning ${dir}:`, err);
          errors++;
        }
      }
    } catch (err) {
      console.error('[ImageService] Error scanning cache directory:', err);
      errors++;
    }

    console.log(`[ImageService] Cache cleanup: deleted ${deleted} directories, ${errors} errors`);
    return { deleted, errors };
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { totalDirs: number; totalSizeMB: number } {
    this.ensureCacheDir();
    
    let totalDirs = 0;
    let totalSize = 0;

    try {
      const barcodeDirs = fs.readdirSync(CACHE_DIR);
      
      for (const dir of barcodeDirs) {
        const dirPath = path.join(CACHE_DIR, dir);
        const stats = fs.statSync(dirPath);
        
        if (stats.isDirectory()) {
          totalDirs++;
          
          // Sum up file sizes
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const fileStats = fs.statSync(filePath);
            totalSize += fileStats.size;
          }
        }
      }
    } catch (err) {
      console.error('[ImageService] Error getting cache stats:', err);
    }

    return {
      totalDirs,
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
    };
  }

  /**
   * Process image from buffer and cache all sizes (for uploaded images)
   */
  static async processAndCacheFromBuffer(barcode: string, buffer: Buffer): Promise<boolean> {
    this.ensureCacheDir();
    
    try {
      // Save original
      const barcodeDir = this.getBarcodeDir(barcode);
      if (!fs.existsSync(barcodeDir)) {
        fs.mkdirSync(barcodeDir, { recursive: true });
      }
      fs.writeFileSync(path.join(barcodeDir, 'original'), buffer);

      // Generate all sizes in parallel
      const sizes: ImageSize[] = ['thumb', 'medium', 'full'];
      await Promise.all(sizes.map(async (size) => {
        const processedBuffer = await this.processImage(buffer, size);
        const cachePath = this.getCachePath(barcode, size);
        fs.writeFileSync(cachePath, processedBuffer);
      }));

      console.log(`[ImageService] Cached all sizes from buffer for barcode: ${barcode}`);
      return true;
    } catch (error) {
      console.error(`[ImageService] Error caching from buffer for ${barcode}:`, error);
      return false;
    }
  }

  /**
   * Clear cache for a specific barcode
   */
  static clearCache(barcode: string): boolean {
    try {
      const barcodeDir = this.getBarcodeDir(barcode);
      if (fs.existsSync(barcodeDir)) {
        fs.rmSync(barcodeDir, { recursive: true, force: true });
        console.log(`[ImageService] Cleared cache for barcode: ${barcode}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[ImageService] Error clearing cache for ${barcode}:`, error);
      return false;
    }
  }
}
