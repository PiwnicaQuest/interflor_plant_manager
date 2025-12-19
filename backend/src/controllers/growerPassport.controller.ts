import { Request, Response } from 'express';
import { GrowerPassportModel } from '../models/GrowerPassport';
import { query } from '../models/database';

export const growerPassportController = {
  // Get all grower passports
  async getAll(req: Request, res: Response) {
    try {
      const passports = await GrowerPassportModel.getAll();
      res.json({ passports });
    } catch (error: any) {
      console.error('Error fetching grower passports:', error);
      res.status(500).json({ error: 'Failed to fetch grower passports' });
    }
  },

  // Get passport by grower name
  async getByGrowerName(req: Request, res: Response) {
    try {
      const { growerName } = req.params;
      const passport = await GrowerPassportModel.getByGrowerName(decodeURIComponent(growerName));

      if (!passport) {
        return res.status(404).json({ error: 'Passport not found for this grower' });
      }

      res.json({ passport });
    } catch (error: any) {
      console.error('Error fetching passport:', error);
      res.status(500).json({ error: 'Failed to fetch passport' });
    }
  },

  // Get passport by floricode
  async getByFloricode(req: Request, res: Response) {
    try {
      const { floricode } = req.params;
      const passport = await GrowerPassportModel.getByFloricode(floricode);

      if (!passport) {
        return res.status(404).json({ error: 'Passport not found for this floricode' });
      }

      res.json({ passport });
    } catch (error: any) {
      console.error('Error fetching passport by floricode:', error);
      res.status(500).json({ error: 'Failed to fetch passport' });
    }
  },

  // Create or update passport (upsert)
  async upsert(req: Request, res: Response) {
    try {
      const { growerName, passportNumber, floricode } = req.body;

      if (!growerName) {
        return res.status(400).json({ error: 'growerName is required' });
      }

      const passport = await GrowerPassportModel.upsert(growerName, passportNumber || '', floricode);
      res.json({ passport, message: 'Passport saved successfully' });
    } catch (error: any) {
      console.error('Error saving passport:', error);
      res.status(500).json({ error: 'Failed to save passport' });
    }
  },

  // Bulk upsert passports
  async bulkUpsert(req: Request, res: Response) {
    try {
      const { passports } = req.body;

      if (!Array.isArray(passports) || passports.length === 0) {
        return res.status(400).json({ error: 'passports array is required' });
      }

      const results = [];
      for (const { growerName, passportNumber, floricode } of passports) {
        if (growerName) {
          const passport = await GrowerPassportModel.upsert(growerName, passportNumber || '', floricode);
          results.push(passport);
        }
      }

      res.json({
        passports: results,
        message: `${results.length} passports saved successfully`
      });
    } catch (error: any) {
      console.error('Error bulk saving passports:', error);
      res.status(500).json({ error: 'Failed to save passports' });
    }
  },

  // Bulk import - delete all and import new
  async bulkImport(req: Request, res: Response) {
    try {
      const { passports } = req.body;

      if (!Array.isArray(passports) || passports.length === 0) {
        return res.status(400).json({ error: 'passports array is required' });
      }

      const data = passports
        .filter((p: any) => p.growerName)
        .map((p: any) => ({
          growerName: String(p.growerName).trim(),
          passportNumber: String(p.passportNumber || '').trim(),
          floricode: p.floricode ? String(p.floricode).trim() : undefined,
        }));

      const imported = await GrowerPassportModel.bulkImport(data);

      res.json({
        imported,
        message: `${imported} passports imported successfully`
      });
    } catch (error: any) {
      console.error('Error bulk importing passports:', error);
      res.status(500).json({ error: 'Failed to import passports' });
    }
  },

  // Delete passport
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await GrowerPassportModel.delete(parseInt(id));

      if (!deleted) {
        return res.status(404).json({ error: 'Passport not found' });
      }

      res.json({ message: 'Passport deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting passport:', error);
      res.status(500).json({ error: 'Failed to delete passport' });
    }
  },

  // Delete all passports
  async deleteAll(req: Request, res: Response) {
    try {
      const count = await GrowerPassportModel.deleteAll();
      res.json({ message: `${count} passports deleted successfully`, deleted: count });
    } catch (error: any) {
      console.error('Error deleting all passports:', error);
      res.status(500).json({ error: 'Failed to delete passports' });
    }
  },

  // Get passport map (for frontend caching)
  async getMap(req: Request, res: Response) {
    try {
      const passportMap = await GrowerPassportModel.getPassportMap();
      const passportsObject: { [key: string]: string } = {};

      passportMap.forEach((value, key) => {
        passportsObject[key] = value;
      });

      res.json({ passports: passportsObject });
    } catch (error: any) {
      console.error('Error fetching passport map:', error);
      res.status(500).json({ error: 'Failed to fetch passport map' });
    }
  },

  // Get floricode map (for EDI import)
  async getFloricodeMap(req: Request, res: Response) {
    try {
      const floricodeMap = await GrowerPassportModel.getFloricodeMap();
      const mapObject: { [key: string]: { growerName: string; passportNumber: string } } = {};

      floricodeMap.forEach((value, key) => {
        mapObject[key] = value;
      });

      res.json({ floricodeMap: mapObject });
    } catch (error: any) {
      console.error('Error fetching floricode map:', error);
      res.status(500).json({ error: 'Failed to fetch floricode map' });
    }
  },

  // Update existing products - replace floricode with grower name
  async updateProductsWithGrowerNames(req: Request, res: Response) {
    try {
      // Update products using a single query that handles leading zeros
      // Products may have floricodes with leading zeros (e.g., "019554")
      // while grower_passports stores them without (e.g., "19554")
      const result = await query(
        `UPDATE products p
         SET grower = gp.grower_name
         FROM grower_passports gp
         WHERE LTRIM(p.grower, '0') = gp.floricode
         AND p.grower ~ '^[0-9]+$'`
      );

      const updated = result.rowCount || 0;

      res.json({
        updated,
        message: `${updated} products updated with grower names`
      });
    } catch (error: any) {
      console.error('Error updating products:', error);
      res.status(500).json({ error: 'Failed to update products' });
    }
  }
};
