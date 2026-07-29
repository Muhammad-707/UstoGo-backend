import { Global, Module } from '@nestjs/common';

import { MAIL_PROVIDER } from './mail.provider';
import { MailService } from './mail.service';
import { SmtpMailProvider } from './smtp-mail.provider';

@Global()
@Module({
  providers: [{ provide: MAIL_PROVIDER, useClass: SmtpMailProvider }, MailService],
  exports: [MailService],
})
export class MailModule {}
