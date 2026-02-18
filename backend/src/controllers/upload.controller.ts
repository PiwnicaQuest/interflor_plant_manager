import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProductModel } from '../models/Product';
import { ImageService } from '../services/imageService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads (temporary storage)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Always save as .webp after processing
    cb(null, `product-${uniqueSuffix}.webp`);
  }
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Nieprawidłowy format pliku. Dozwolone: JPG, PNG, WEBP, GIF'));
  }
};

export const productImageUpload = multer({
  storage: multer.memoryStorage(), // Use memory storage for processing
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max (before compression)
  }
});

export class UploadController {
  static async uploadProductImage(req: AuthRequest, res: Response) {
    try {
      const productId = parseInt(req.params.id);

      if (!req.file) {
        return res.status(400).json({ error: 'Brak pliku' });
      }

      const product = await ProductModel.getById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      // Delete old image if exists (local file)
      if (product.imageUrl && product.imageUrl.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '../../', product.imageUrl.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (err) {
            console.error('Error deleting old image:', err);
          }
        }
      }

      // Process image with Sharp - resize and convert to WebP
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `product-${uniqueSuffix}.webp`;
      const outputPath = path.join(uploadsDir, filename);

      await sharp(req.file.buffer)
        .resize(800, 800, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .webp({ quality: 90 })
        .toFile(outputPath);

      // Update product with new image URL
      const imageUrl = `/uploads/products/${filename}`;
      const updatedProduct = await ProductModel.update(productId, { imageUrl });

      // Generate cache variants if product has barcode
      if (product.barcode) {
        // Create a file:// URL for local processing
        const localImagePath = outputPath;
        
        // CLEAR old cache first, then generate new cache
          ImageService.clearCache(product.barcode);
          console.log(`[UPLOAD] Cleared old cache for barcode: ${product.barcode}`);
        try {
          const imageBuffer = fs.readFileSync(localImagePath);
          await ImageService.processAndCacheFromBuffer(product.barcode, imageBuffer);
          console.log(`[UPLOAD] Generated cache for barcode: ${product.barcode}`);
        } catch (cacheErr) {
          console.error('[UPLOAD] Cache generation failed:', cacheErr);
          // Don't fail the upload if cache fails
        }
      }

      return res.json({
        message: 'Zdjęcie zostało przesłane i zoptymalizowane',
        imageUrl,
        product: updatedProduct,
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: 'Błąd podczas przesyłania pliku' });
    }
  }

  static async deleteProductImage(req: AuthRequest, res: Response) {
    try {
      const productId = parseInt(req.params.id);

      const product = await ProductModel.getById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      if (!product.imageUrl) {
        return res.status(400).json({ error: 'Produkt nie ma zdjęcia' });
      }

      // Delete image file (only local files)
      if (product.imageUrl.startsWith('/uploads/')) {
        const imagePath = path.join(__dirname, '../../', product.imageUrl.replace(/^\//, ''));
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      // Clear image cache if barcode exists
      if (product.barcode) {
        try {
          ImageService.clearCache(product.barcode);
        } catch (err) {
          console.error('[UPLOAD] Cache clear failed:', err);
        }
      }

      // Update product to remove image URL
      const updatedProduct = await ProductModel.update(productId, { imageUrl: null as any });

      return res.json({
        message: 'Zdjęcie zostało usunięte',
        product: updatedProduct,
      });
    } catch (error) {
      console.error('Delete image error:', error);
      return res.status(500).json({ error: 'Błąd podczas usuwania zdjęcia' });
    }
  }

  static async setProductImageUrl(req: AuthRequest, res: Response) {
    try {
      const productId = parseInt(req.params.id);
      const { imageUrl } = req.body;

      if (!imageUrl || typeof imageUrl !== 'string') {
        return res.status(400).json({ error: 'Brak URL zdjęcia' });
      }

      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'URL musi zaczynac sie od http:// lub https://' });
      }

      const product = await ProductModel.getById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      // Delete old local image if exists
      if (product.imageUrl && product.imageUrl.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '../../', product.imageUrl.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (err) {
            console.error('Error deleting old image:', err);
          }
        }
      }

      // Update product with new image URL
      const updatedProduct = await ProductModel.update(productId, { imageUrl });

      // Clear old cache and pre-generate from URL if barcode exists
      if (product.barcode) {
        try {
          ImageService.clearCache(product.barcode);
          await ImageService.processAndCache(product.barcode, imageUrl);
          console.log(`[IMAGE-URL] Generated cache for barcode: ${product.barcode}`);
        } catch (cacheErr) {
          console.error('[IMAGE-URL] Cache generation failed:', cacheErr);
        }
      }

      return res.json({
        message: 'URL zdjecia zostal zapisany',
        imageUrl,
        product: updatedProduct,
      });
    } catch (error) {
      console.error('Set image URL error:', error);
      return res.status(500).json({ error: 'Blad podczas zapisywania URL zdjecia' });
    }
  }

}
