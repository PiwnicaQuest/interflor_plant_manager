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
      return res.status(500).json({ error: 'Błąd serwera' });
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
        return res.status(400).json({ error: 'Nazwa tagu nie może byc pusta' });
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
      await SettingsModel.upsertSetting(TAGS_SETTING_KEY, JSON.stringify(definedTags), 'Lista dostępnych tagow');

      return res.json({ 
        success: true, 
        tag: { name: trimmedName, productCount: 0, isDefined: true }
      });
    } catch (error) {
      console.error('Error creating tag:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
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
      
      await SettingsModel.upsertSetting(TAGS_SETTING_KEY, JSON.stringify(newTags), 'Lista dostępnych tagow');

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
      return res.status(500).json({ error: 'Błąd serwera' });
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
        return res.status(400).json({ error: 'Nowa nazwa tagu nie może byc pusta' });
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
      
      await SettingsModel.upsertSetting(TAGS_SETTING_KEY, JSON.stringify(newTags), 'Lista dostępnych tagow');

      // Update in all products
      await query(
        "UPDATE products SET tags = array_replace(tags, $1, $2) WHERE tags @> ARRAY[$1]::text[]",
        [decodedOldName, trimmedNewName]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Error updating tag:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Suggest tags for a product based on plant name and pot size
   * Reads keywords from tag_keywords table
   */
  static async suggestTags(req: AuthRequest, res: Response) {
    try {
      const { plantName, potSize } = req.body;

      if (!plantName) {
        return res.json({ suggestedTags: [] });
      }

      const name = plantName.toLowerCase();
      const suggested: string[] = [];

      // Load all keyword rules from DB
      const result = await query<{ tagName: string; keyword: string }>(
        "SELECT tag_name, keyword FROM tag_keywords ORDER BY tag_name"
      );

      // Group keywords by tag
      const rules: Record<string, string[]> = {};
      for (const row of result.rows) {
        if (!rules[row.tagName]) rules[row.tagName] = [];
        rules[row.tagName].push(row.keyword.toLowerCase());
      }

      // Match keywords against product name
      for (const [tagName, keywords] of Object.entries(rules)) {
        if (keywords.some(kw => name.includes(kw))) {
          suggested.push(tagName);
        }
      }

      // Size-based tags from pot size ("P.20" -> 20cm pot)
      if (potSize) {
        const s = String(potSize);
        // Strip letter prefix (P., p., C., K.) before parsing
        const cleaned = s.replace(/^[pPcCkK]\.?/, '').replace(',','.');
        const numericSize = parseFloat(cleaned);
        if (!isNaN(numericSize) && numericSize > 0) {
          // Detect liters (containers): "Lt", "L", "liter"
          const isLiters = /\d\s*(?:lt|l\b|liter)/i.test(s);
          if (isLiters) {
            if (numericSize <= 3) suggested.push('Małe');
            else if (numericSize >= 10) suggested.push('Duże');
          } else {
            if (numericSize <= 10) suggested.push('Małe');
            else if (numericSize >= 17) suggested.push('Duże');
          }
        }
      }

      return res.json({ suggestedTags: suggested });
    } catch (error) {
      console.error('Error suggesting tags:', error);
      return res.status(500).json({ error: 'B\u0142\u0105d serwera' });
    }
  }

  /**
   * Get all tag keywords grouped by tag
   */
  static async getTagKeywords(req: AuthRequest, res: Response) {
    try {
      const result = await query<{ id: number; tagName: string; keyword: string }>(
        "SELECT id, tag_name, keyword FROM tag_keywords ORDER BY tag_name, keyword"
      );

      // Group by tag_name
      const grouped: Record<string, Array<{ id: number; keyword: string }>> = {};
      for (const row of result.rows) {
        if (!grouped[row.tagName]) grouped[row.tagName] = [];
        grouped[row.tagName].push({ id: row.id, keyword: row.keyword });
      }

      return res.json({ tagKeywords: grouped });
    } catch (error) {
      console.error('Error fetching tag keywords:', error);
      return res.status(500).json({ error: 'B\u0142\u0105d serwera' });
    }
  }

  /**
   * Add a keyword for a tag
   */
  static async addTagKeyword(req: AuthRequest, res: Response) {
    try {
      const { tagName, keyword } = req.body;

      if (!tagName || !keyword) {
        return res.status(400).json({ error: 'Nazwa tagu i s\u0142owo kluczowe s\u0105 wymagane' });
      }

      const trimmedKeyword = keyword.trim().toLowerCase();
      if (!trimmedKeyword) {
        return res.status(400).json({ error: 'S\u0142owo kluczowe nie mo\u017ce by\u0107 puste' });
      }

      const result = await query<{ id: number }>(
        "INSERT INTO tag_keywords (tag_name, keyword) VALUES ($1, $2) ON CONFLICT (tag_name, keyword) DO NOTHING RETURNING id",
        [tagName, trimmedKeyword]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'To s\u0142owo kluczowe ju\u017c istnieje dla tego tagu' });
      }

      return res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
      console.error('Error adding tag keyword:', error);
      return res.status(500).json({ error: 'B\u0142\u0105d serwera' });
    }
  }

  /**
   * Delete a keyword by id
   */
  static async deleteTagKeyword(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      await query("DELETE FROM tag_keywords WHERE id = $1", [id]);

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting tag keyword:', error);
      return res.status(500).json({ error: 'B\u0142\u0105d serwera' });
    }
  }

  /**
   * Bulk add keywords for a tag
   */
  static async bulkAddTagKeywords(req: AuthRequest, res: Response) {
    try {
      const { tagName, keywords } = req.body;

      if (!tagName || !keywords || !Array.isArray(keywords)) {
        return res.status(400).json({ error: 'Nazwa tagu i lista s\u0142\u00f3w kluczowych s\u0105 wymagane' });
      }

      let added = 0;
      for (const kw of keywords) {
        const trimmed = kw.trim().toLowerCase();
        if (!trimmed) continue;
        const result = await query(
          "INSERT INTO tag_keywords (tag_name, keyword) VALUES ($1, $2) ON CONFLICT (tag_name, keyword) DO NOTHING RETURNING id",
          [tagName, trimmed]
        );
        if (result.rows.length > 0) added++;
      }

      return res.json({ success: true, added });
    } catch (error) {
      console.error('Error bulk adding tag keywords:', error);
      return res.status(500).json({ error: 'B\u0142\u0105d serwera' });
    }
  }
}
