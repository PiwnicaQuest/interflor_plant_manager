import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProductModel } from '../models/Product';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Nieprawidłowy format pliku. Dozwolone: JPG, PNG, WEBP'));
  }
};

export const productImageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
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
        // Delete uploaded file if product not found
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      // Delete old image if exists
      if (product.imageUrl) {
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
      const imageUrl = `/uploads/products/${req.file.filename}`;
      const updatedProduct = await ProductModel.update(productId, { imageUrl });

      return res.json({
        message: 'Zdjęcie zostało przesłane',
        imageUrl,
        product: updatedProduct,
      });
    } catch (error) {
      console.error('Upload error:', error);
      // Clean up uploaded file on error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error('Error cleaning up file:', err);
        }
      }
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

      // Delete image file
      const imagePath = path.join(__dirname, '../../', product.imageUrl.replace(/^\//, ''));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
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
}
