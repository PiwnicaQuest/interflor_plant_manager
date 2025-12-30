import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../models/database';
import { SettingsModel } from '../models/Settings';

const TAGS_SETTING_KEY = 'available_tags';

export interface TagInfo {
  name: string;
  productCount: number;
  isDefined: boolean;
}

export class TagsController {
  /**
   * Get all tags - both defined in settings and used in products
   */
  static async getAllTags(req: AuthRequest, res: Response) {
    try {
      // Get defined tags from settings
      const settingValue = await SettingsModel.getSetting(TAGS_SETTING_KEY);
      const definedTags: string[] = Array.isArray(settingValue) ? settingValue : (settingValue ? JSON.parse(settingValue) : []);

      // Get tags actually used in products
      const result = await query<{ tag: string }>(
        "SELECT DISTINCT unnest(tags) as tag FROM products WHERE tags IS NOT NULL AND array_length(tags, 1) > 0 ORDER BY tag"
      );
      const usedTags = result.rows.map(r => r.tag);

      // Merge both lists
      const allTags = [...new Set([...definedTags, ...usedTags])].sort((a, b) => 
        a.localeCompare(b, 'pl')
      );

      // Count products per tag
      const countResult = await query<{ tag: string; count: string }>(
        "SELECT tag, COUNT(*) as count FROM (SELECT unnest(tags) as tag FROM products WHERE tags IS NOT NULL) t GROUP BY tag ORDER BY tag"
      );
      
      const tagCounts: Record<string, number> = {};
      countResult.rows.forEach(r => {
        tagCounts[r.tag] = parseInt(r.count);
      });

      const tags: TagInfo[] = allTags.map(tag => ({
        name: tag,
        productCount: tagCounts[tag] || 0,
        isDefined: definedTags.includes(tag)
      }));

      return res.json({ tags });
    } catch (error) {
      console.error('Error fetching tags:', error);
      return res.status(500).json({ error: 'Blad serwera' });
    }
  }

  /**
   * Create a new tag (add to settings)
   */
  static async createTag(req: AuthRequest, res: Response) {
    try {
      const { name } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Nazwa tagu jest wymagana' });
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Nazwa tagu nie moze byc pusta' });
      }

      // Get current tags
      const settingValue = await SettingsModel.getSetting(TAGS_SETTING_KEY);
      const definedTags: string[] = Array.isArray(settingValue) ? settingValue : (settingValue ? JSON.parse(settingValue) : []);

      // Check if tag already exists
      if (definedTags.some(t => t.toLowerCase() === trimmedName.toLowerCase())) {
        return res.status(400).json({ error: 'Tag o tej nazwie juz istnieje' });
      }

      // Add new tag
      definedTags.push(trimmedName);
      definedTags.sort((a, b) => a.localeCompare(b, 'pl'));

      // Save to settings
      await SettingsModel.upsertSetting(TAGS_SETTING_KEY, JSON.stringify(definedTags), 'Lista dostepnych tagow');

      return res.json({ 
        success: true, 
        tag: { name: trimmedName, productCount: 0, isDefined: true }
      });
    } catch (error) {
      console.error('Error creating tag:', error);
      return res.status(500).json({ error: 'Blad serwera' });
    }
  }

  /**
   * Delete a tag
   */
  static async deleteTag(req: AuthRequest, res: Response) {
    try {
      const { tagName } = req.params;
      const { removeFromProducts } = req.query;

      if (!tagName) {
        return res.status(400).json({ error: 'Nazwa tagu jest wymagana' });
      }

      const decodedTagName = decodeURIComponent(tagName);

      // Remove from settings
      const settingValue = await SettingsModel.getSetting(TAGS_SETTING_KEY);
      const definedTags: string[] = Array.isArray(settingValue) ? settingValue : (settingValue ? JSON.parse(settingValue) : []);
      const newTags = definedTags.filter(t => t !== decodedTagName);
      
      await SettingsModel.upsertSetting(TAGS_SETTING_KEY, JSON.stringify(newTags), 'Lista dostepnych tagow');

      // Optionally remove from all products
      if (removeFromProducts === 'true') {
        await query(
          "UPDATE products SET tags = array_remove(tags, $1) WHERE tags @> ARRAY[$1]::text[]",
          [decodedTagName]
        );
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting tag:', error);
      return res.status(500).json({ error: 'Blad serwera' });
    }
  }

  /**
   * Update/rename a tag
   */
  static async updateTag(req: AuthRequest, res: Response) {
    try {
      const { tagName } = req.params;
      const { newName } = req.body;

      if (!tagName || !newName) {
        return res.status(400).json({ error: 'Nazwa tagu jest wymagana' });
      }

      const decodedOldName = decodeURIComponent(tagName);
      const trimmedNewName = newName.trim();

      if (!trimmedNewName) {
        return res.status(400).json({ error: 'Nowa nazwa tagu nie moze byc pusta' });
      }

      // Update in settings
      const settingValue = await SettingsModel.getSetting(TAGS_SETTING_KEY);
      const definedTags: string[] = Array.isArray(settingValue) ? settingValue : (settingValue ? JSON.parse(settingValue) : []);
      
      // Check if new name already exists
      if (definedTags.some(t => t.toLowerCase() === trimmedNewName.toLowerCase() && t !== decodedOldName)) {
        return res.status(400).json({ error: 'Tag o tej nazwie juz istnieje' });
      }

      const newTags = definedTags.map(t => t === decodedOldName ? trimmedNewName : t);
      newTags.sort((a, b) => a.localeCompare(b, 'pl'));
      
      await SettingsModel.upsertSetting(TAGS_SETTING_KEY, JSON.stringify(newTags), 'Lista dostepnych tagow');

      // Update in all products
      await query(
        "UPDATE products SET tags = array_replace(tags, $1, $2) WHERE tags @> ARRAY[$1]::text[]",
        [decodedOldName, trimmedNewName]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Error updating tag:', error);
      return res.status(500).json({ error: 'Blad serwera' });
    }
  }
}
