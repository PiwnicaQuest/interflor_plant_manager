import { Request, Response } from 'express';
import { SettingsModel } from '../models/Settings';

/**
 * GET /api/settings
 * Get all settings
 */
export async function getAllSettings(_req: Request, res: Response) {
  try {
    const settings = await SettingsModel.getAllSettings();
    return res.json({ settings });
  } catch (error: any) {
    console.error('[settingsController.getAllSettings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/settings/pricing
 * Get pricing settings (cost % and margin %)
 */
export async function getPricingSettings(_req: Request, res: Response) {
  try {
    const settings = await SettingsModel.getPricingSettings();
    return res.json(settings);
  } catch (error: any) {
    console.error('[settingsController.getPricingSettings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/settings/pricing
 * Update pricing settings
 * Body: { costPercentage: number, marginPercentage: number, eurToPlnRate?: number }
 */
export async function updatePricingSettings(req: Request, res: Response) {
  try {
    const { costPercentage, marginPercentage, eurToPlnRate } = req.body;

    // Validation
    if (typeof costPercentage !== 'number' || typeof marginPercentage !== 'number') {
      return res.status(400).json({ error: 'costPercentage and marginPercentage must be numbers' });
    }

    if (costPercentage < 0 || costPercentage > 100) {
      return res.status(400).json({ error: 'costPercentage must be between 0 and 100' });
    }

    if (marginPercentage < 0 || marginPercentage > 1000) {
      return res.status(400).json({ error: 'marginPercentage must be between 0 and 1000' });
    }

    // Walidacja kursu EUR/PLN (jeśli podany)
    if (eurToPlnRate !== undefined) {
      if (typeof eurToPlnRate !== 'number' || eurToPlnRate <= 0 || eurToPlnRate > 100) {
        return res.status(400).json({ error: 'eurToPlnRate must be a positive number (0-100)' });
      }
    }

    const settings = await SettingsModel.updatePricingSettings(costPercentage, marginPercentage, eurToPlnRate);
    return res.json(settings);
  } catch (error: any) {
    console.error('[settingsController.updatePricingSettings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/settings/company
 * Get company settings
 */
export async function getCompanySettings(_req: Request, res: Response) {
  try {
    const settings = await SettingsModel.getCompanySettings();
    return res.json(settings);
  } catch (error: any) {
    console.error('[settingsController.getCompanySettings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/settings/company
 * Update company settings
 */
export async function updateCompanySettings(req: Request, res: Response) {
  try {
    const {
      companyName, nip, regon, street, postalCode, city, country,
      phone, email, website, bankName, bankAccount, bankSwift, invoiceComment
    } = req.body;

    // Validation
    if (!companyName || typeof companyName !== 'string') {
      return res.status(400).json({ error: 'Nazwa firmy jest wymagana' });
    }

    if (!nip || typeof nip !== 'string') {
      return res.status(400).json({ error: 'NIP jest wymagany' });
    }

    if (!street || typeof street !== 'string') {
      return res.status(400).json({ error: 'Adres jest wymagany' });
    }

    if (!postalCode || typeof postalCode !== 'string') {
      return res.status(400).json({ error: 'Kod pocztowy jest wymagany' });
    }

    if (!city || typeof city !== 'string') {
      return res.status(400).json({ error: 'Miasto jest wymagane' });
    }

    const settings = await SettingsModel.updateCompanySettings({
      companyName,
      nip,
      regon: regon || '',
      street,
      postalCode,
      city,
      country: country || 'Polska',
      phone: phone || '',
      email: email || '',
      website: website || '',
      bankName: bankName || '',
      bankAccount: bankAccount || '',
      bankSwift: bankSwift || '',
      invoiceComment: invoiceComment || '',
    });

    return res.json(settings);
  } catch (error: any) {
    console.error('[settingsController.updateCompanySettings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/settings/email-import
 * Get email import settings
 */
export async function getEmailImportSettings(_req: Request, res: Response) {
  try {
    const settings = await SettingsModel.getEmailImportSettings();
    // Nie zwracamy hasła w odpowiedzi dla bezpieczeństwa
    return res.json({
      ...settings,
      emailPassword: settings.emailPassword ? '********' : '',
    });
  } catch (error: any) {
    console.error('[settingsController.getEmailImportSettings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/settings/email-import
 * Update email import settings
 */
export async function updateEmailImportSettings(req: Request, res: Response) {
  try {
    const {
      emailAddress, emailPassword, imapServer, imapPort,
      smtpServer, smtpPort, smtpSecurity, enabled
    } = req.body;

    // Validation
    if (!emailAddress || typeof emailAddress !== 'string') {
      return res.status(400).json({ error: 'Adres email jest wymagany' });
    }

    if (!imapServer || typeof imapServer !== 'string') {
      return res.status(400).json({ error: 'Serwer IMAP jest wymagany' });
    }

    if (!smtpServer || typeof smtpServer !== 'string') {
      return res.status(400).json({ error: 'Serwer SMTP jest wymagany' });
    }

    // Pobierz aktualne ustawienia żeby zachować hasło jeśli nie zostało zmienione
    const currentSettings = await SettingsModel.getEmailImportSettings();
    
    // Jeśli hasło to gwiazdki lub puste, zachowaj stare
    let finalPassword = emailPassword;
    if (!emailPassword || emailPassword === '********') {
      finalPassword = currentSettings.emailPassword;
    }

    const settings = await SettingsModel.updateEmailImportSettings({
      emailAddress,
      emailPassword: finalPassword,
      imapServer,
      imapPort: parseInt(imapPort) || 993,
      smtpServer,
      smtpPort: parseInt(smtpPort) || 587,
      smtpSecurity: smtpSecurity || 'starttls',
      enabled: enabled === true || enabled === 'true',
    });

    return res.json({
      ...settings,
      emailPassword: '********',
    });
  } catch (error: any) {
    console.error('[settingsController.updateEmailImportSettings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/settings/:key
 * Get a specific setting by key
 */
export async function getSettingByKey(req: Request, res: Response) {
  try {
    const { key } = req.params;
    const value = await SettingsModel.getSetting(key);

    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    return res.json({ key, value });
  } catch (error: any) {
    console.error('[settingsController.getSettingByKey] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/settings/:key
 * Update a specific setting
 * Body: { value: string }
 */
export async function updateSetting(req: Request, res: Response) {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (typeof value !== 'string') {
      return res.status(400).json({ error: 'value must be a string' });
    }

    const setting = await SettingsModel.updateSetting(key, value);

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    return res.json({ setting });
  } catch (error: any) {
    console.error('[settingsController.updateSetting] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
