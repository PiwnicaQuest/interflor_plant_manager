import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PriceGroupModel } from '../models/PriceGroup';

export class PriceGroupController {
  static async getAll(_req: AuthRequest, res: Response) {
    try {
      const priceGroups = await PriceGroupModel.getAll();
      return res.json({ priceGroups });
    } catch (error) {
      console.error('Get price groups error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID grupy cenowej' });
      }

      const priceGroup = await PriceGroupModel.getById(id);

      if (!priceGroup) {
        return res.status(404).json({ error: 'Grupa cenowa nie znaleziona' });
      }

      return res.json({ priceGroup });
    } catch (error) {
      console.error('Get price group error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, discountPercentage, description } = req.body;

      // Validation
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Nazwa grupy cenowej jest wymagana' });
      }

      if (discountPercentage === undefined || discountPercentage === null) {
        return res.status(400).json({ error: 'Rabat jest wymagany' });
      }

      if (typeof discountPercentage !== 'number') {
        return res.status(400).json({ error: 'Rabat musi być liczbą' });
      }

      if (discountPercentage < 0 || discountPercentage > 100) {
        return res.status(400).json({ error: 'Rabat musi być między 0 a 100%' });
      }

      const priceGroup = await PriceGroupModel.create({
        name: name.trim(),
        discountPercentage,
        description: description?.trim(),
      });

      return res.status(201).json({
        message: 'Grupa cenowa została utworzona',
        priceGroup,
      });
    } catch (error) {
      console.error('Create price group error:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Błąd serwera' });
      }
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { name, discountPercentage, description } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID grupy cenowej' });
      }

      // Validation
      if (name !== undefined && name.trim().length === 0) {
        return res.status(400).json({ error: 'Nazwa grupy cenowej nie może być pusta' });
      }

      if (discountPercentage !== undefined) {
        if (typeof discountPercentage !== 'number') {
          return res.status(400).json({ error: 'Rabat musi być liczbą' });
        }

        if (discountPercentage < 0 || discountPercentage > 100) {
          return res.status(400).json({ error: 'Rabat musi być między 0 a 100%' });
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (discountPercentage !== undefined) updateData.discountPercentage = discountPercentage;
      if (description !== undefined) updateData.description = description?.trim();

      const priceGroup = await PriceGroupModel.update(id, updateData);

      if (!priceGroup) {
        return res.status(404).json({ error: 'Grupa cenowa nie znaleziona' });
      }

      return res.json({
        message: 'Grupa cenowa została zaktualizowana',
        priceGroup,
      });
    } catch (error) {
      console.error('Update price group error:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Błąd serwera' });
      }
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID grupy cenowej' });
      }

      // Prevent deletion of default price group (id = 1)
      if (id === 1) {
        return res.status(400).json({ error: 'Nie można usunąć domyślnej grupy cenowej' });
      }

      const success = await PriceGroupModel.delete(id);

      if (!success) {
        return res.status(404).json({ error: 'Grupa cenowa nie znaleziona' });
      }

      return res.json({ message: 'Grupa cenowa została usunięta' });
    } catch (error) {
      console.error('Delete price group error:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Błąd serwera' });
      }
    }
  }

  static async getCustomers(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID grupy cenowej' });
      }

      const customers = await PriceGroupModel.getCustomersByPriceGroup(id);

      return res.json({ customers });
    } catch (error) {
      console.error('Get price group customers error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }
}
