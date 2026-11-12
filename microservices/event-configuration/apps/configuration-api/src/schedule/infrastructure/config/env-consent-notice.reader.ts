import { Injectable } from '@nestjs/common';
import { ConsentNoticeReader } from '../../application/ports/consent-notice-reader.port';

@Injectable()
export class EnvConsentNoticeReader implements ConsentNoticeReader {
  getNotice(): { text: string; version: string } | null {
    const text = process.env.SPEAKER_CONSENT_NOTICE_TEXT?.trim();
    const version = process.env.SPEAKER_CONSENT_NOTICE_VERSION?.trim();
    return text && version ? { text, version } : null;
  }
}
