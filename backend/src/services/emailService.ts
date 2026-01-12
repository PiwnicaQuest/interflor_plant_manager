import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string = '';

  initialize() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    if (!host || !user || !pass) {
      console.warn('Email service not configured - SMTP_HOST, SMTP_USER, SMTP_PASSWORD required');
      return;
    }

    this.fromEmail = process.env.SMTP_FROM || user;

    // Create transporter with TLS options for compatibility
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      tls: {
        // Validate SSL/TLS certificates
        rejectUnauthorized: true,
      },
    });

    // Verify connection
    this.transporter.verify((error) => {
      if (error) {
        console.error('Email service connection error:', error);
      } else {
        console.log('Email service ready');
      }
    });
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email service not configured');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      console.log(`Email sent to ${options.to}`);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendProformaEmail(
    email: string,
    proformaNumber: string,
    printUrl: string,
    subject?: string,
    message?: string,
    customerName?: string,
    totalGross?: number
  ): Promise<boolean> {
    const greeting = customerName ? `Szanowny/a ${customerName}` : 'Szanowny Kliencie';
    const defaultSubject = subject || `Faktura Pro Forma ${proformaNumber}`;
    const customMessage = message ? `<p style="margin: 20px 0; white-space: pre-line;">${message}</p>` : '';
    const totalInfo = totalGross ? `<p><strong>Kwota do zaplaty:</strong> ${Number(totalGross).toFixed(2)} PLN</p>` : '';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .proforma-info { background-color: #fff; border: 2px solid #16a34a; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .proforma-info p { margin: 10px 0; }
    .proforma-info strong { color: #16a34a; }
    .button { display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Faktura Pro Forma</h1>
    </div>
    <div class="content">
      <p>${greeting},</p>

      <p>W zalaczeniu przesylamy fakture pro forma.</p>

      ${customMessage}

      <div class="proforma-info">
        <p><strong>Numer dokumentu:</strong> ${proformaNumber}</p>
        ${totalInfo}
      </div>

      <p>Fakture pro forma mozesz pobrac klikajac ponizszy przycisk:</p>

      <p style="text-align: center;">
        <a href="${printUrl}" class="button">Pobierz Pro Forme</a>
      </p>

      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
        W razie pytan prosimy o kontakt.
      </p>
    </div>
    <div class="footer">
      <p>POLFLOR - System zarzadzania magazynem roslin</p>
      <p>Ta wiadomosc zostala wygenerowana automatycznie.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
${greeting},

W zalaczeniu przesylamy fakture pro forma.

${message || ''}

Numer dokumentu: ${proformaNumber}
${totalGross ? `Kwota do zaplaty: ${Number(totalGross).toFixed(2)} PLN` : ''}

Link do pobrania: ${printUrl}

W razie pytan prosimy o kontakt.

Pozdrawiamy,
Zespol POLFLOR
    `;

    return this.sendEmail({
      to: email,
      subject: defaultSubject,
      text,
      html,
    });
  }

  async sendShopCredentials(
    email: string,
    password: string,
    customerName?: string
  ): Promise<boolean> {
    const shopUrl = process.env.SHOP_URL || 'https://sklep.fast-site.pl';

    const greeting = customerName ? `Szanowny/a ${customerName}` : 'Szanowny Kliencie';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .credentials { background-color: #fff; border: 2px solid #16a34a; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .credentials p { margin: 10px 0; }
    .credentials strong { color: #16a34a; }
    .code { font-family: monospace; background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 16px; }
    .button { display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>POLFLOR - Sklep Online</h1>
    </div>
    <div class="content">
      <p>${greeting},</p>

      <p>Twoje konto w sklepie internetowym POLFLOR zostalo utworzone.
      Ponizej znajdziesz dane do logowania:</p>

      <div class="credentials">
        <p><strong>Email (login):</strong> <span class="code">${email}</span></p>
        <p><strong>Haslo:</strong> <span class="code">${password}</span></p>
      </div>

      <p>Mozesz zalogowac sie do sklepu klikajac ponizszy przycisk:</p>

      <p style="text-align: center;">
        <a href="${shopUrl}" class="button">Przejdz do sklepu</a>
      </p>

      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
        <strong>Uwaga:</strong> Zalecamy zmiane hasla po pierwszym logowaniu.
        Jesli nie zakladales/as konta w naszym sklepie, prosimy o zignorowanie tej wiadomosci.
      </p>
    </div>
    <div class="footer">
      <p>POLFLOR - System zarzadzania magazynem roslin</p>
      <p>Ta wiadomosc zostala wygenerowana automatycznie.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
${greeting},

Twoje konto w sklepie internetowym POLFLOR zostalo utworzone.

Dane do logowania:
- Email (login): ${email}
- Haslo: ${password}

Link do sklepu: ${shopUrl}

Zalecamy zmiane hasla po pierwszym logowaniu.

Pozdrawiamy,
Zespol POLFLOR
    `;

    return this.sendEmail({
      to: email,
      subject: 'Twoje konto w sklepie POLFLOR',
      text,
      html,
    });
  }

  async sendPasswordReset(
    email: string,
    newPassword: string,
    customerName?: string
  ): Promise<boolean> {
    const shopUrl = process.env.SHOP_URL || 'https://sklep.fast-site.pl';

    const greeting = customerName ? `Szanowny/a ${customerName}` : 'Szanowny Kliencie';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .credentials { background-color: #fff; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .credentials p { margin: 10px 0; }
    .credentials strong { color: #f59e0b; }
    .code { font-family: monospace; background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 16px; }
    .button { display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>POLFLOR - Reset hasla</h1>
    </div>
    <div class="content">
      <p>${greeting},</p>

      <p>Twoje haslo do sklepu internetowego POLFLOR zostalo zresetowane.
      Ponizej znajdziesz nowe dane do logowania:</p>

      <div class="credentials">
        <p><strong>Email (login):</strong> <span class="code">${email}</span></p>
        <p><strong>Nowe haslo:</strong> <span class="code">${newPassword}</span></p>
      </div>

      <p>Mozesz zalogowac sie do sklepu klikajac ponizszy przycisk:</p>

      <p style="text-align: center;">
        <a href="${shopUrl}" class="button">Przejdz do sklepu</a>
      </p>

      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
        <strong>Uwaga:</strong> Zalecamy zmiane hasla po zalogowaniu.
        Jesli nie prosiles/as o reset hasla, skontaktuj sie z nami.
      </p>
    </div>
    <div class="footer">
      <p>POLFLOR - System zarzadzania magazynem roslin</p>
      <p>Ta wiadomosc zostala wygenerowana automatycznie.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
${greeting},

Twoje haslo do sklepu internetowego POLFLOR zostalo zresetowane.

Nowe dane do logowania:
- Email (login): ${email}
- Nowe haslo: ${newPassword}

Link do sklepu: ${shopUrl}

Zalecamy zmiane hasla po zalogowaniu.

Pozdrawiamy,
Zespol POLFLOR
    `;

    return this.sendEmail({
      to: email,
      subject: 'Reset hasla - POLFLOR',
      text,
      html,
    });
  }

  async sendInvoiceEmail(
    email: string,
    invoiceNumber: string,
    pdfBuffer: Buffer,
    customerName?: string,
    totalGross?: number,
    paymentDeadline?: string,
    subject?: string,
    message?: string
  ): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email service not configured');
      return false;
    }

    const greeting = customerName ? `Szanowny/a ${customerName}` : 'Szanowny Kliencie';
    const defaultSubject = subject || `Faktura VAT ${invoiceNumber} - POLFLOR`;
    const customMessage = message ? `<p style="margin: 20px 0; white-space: pre-line;">${message}</p>` : '';
    const totalInfo = totalGross ? `<p><strong>Kwota do zapłaty:</strong> ${Number(totalGross).toFixed(2)} PLN</p>` : '';
    const deadlineInfo = paymentDeadline ? `<p><strong>Termin płatności:</strong> ${paymentDeadline}</p>` : '';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .invoice-info { background-color: #fff; border: 2px solid #16a34a; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .invoice-info p { margin: 10px 0; }
    .invoice-info strong { color: #16a34a; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Faktura VAT</h1>
    </div>
    <div class="content">
      <p>${greeting},</p>

      <p>W załączeniu przesyłamy fakturę VAT.</p>

      ${customMessage}

      <div class="invoice-info">
        <p><strong>Numer faktury:</strong> ${invoiceNumber}</p>
        ${totalInfo}
        ${deadlineInfo}
      </div>

      <p>Faktura znajduje się w załączniku do tej wiadomości w formacie PDF.</p>

      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
        W razie pytań prosimy o kontakt.
      </p>
    </div>
    <div class="footer">
      <p>POLFLOR - System zarządzania magazynem roślin</p>
      <p>Ta wiadomość została wygenerowana automatycznie.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
${greeting},

W załączeniu przesyłamy fakturę VAT.

${message || ''}

Numer faktury: ${invoiceNumber}
${totalGross ? `Kwota do zapłaty: ${Number(totalGross).toFixed(2)} PLN` : ''}
${paymentDeadline ? `Termin płatności: ${paymentDeadline}` : ''}

Faktura znajduje się w załączniku do tej wiadomości w formacie PDF.

W razie pytań prosimy o kontakt.

Pozdrawiamy,
Zespół POLFLOR
    `;

    try {
      await this.transporter.sendMail({
        from: this.fromEmail,
        to: email,
        subject: defaultSubject,
        text,
        html,
        attachments: [
          {
            filename: `Faktura_${invoiceNumber.replace(/\//g, '_')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      console.log(`Invoice email sent to ${email} for invoice ${invoiceNumber}`);
      return true;
    } catch (error) {
      console.error('Error sending invoice email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
