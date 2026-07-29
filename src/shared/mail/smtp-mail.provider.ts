import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { AppConfigService } from '@config/app-config.service';

import type { MailMessage, MailProvider } from './mail.provider';

/**
 * SMTP transport. Mailpit locally, a real relay in deployed environments — the
 * application never knows which, because both speak SMTP.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    const { host, port, user, password } = config.mail;

    this.from = config.mail.from;
    this.transporter = createTransport({
      host,
      port,
      // Implicit TLS on 465; STARTTLS is negotiated on everything else. Mailpit
      // accepts unauthenticated plaintext locally, which is why credentials are
      // optional rather than merely unset.
      secure: port === 465,
      ...(user !== null && password !== null ? { auth: { user, pass: password } } : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    });
  }
}
