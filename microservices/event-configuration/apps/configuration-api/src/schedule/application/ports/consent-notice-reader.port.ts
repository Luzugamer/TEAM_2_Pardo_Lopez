export const CONSENT_NOTICE_READER = Symbol('CONSENT_NOTICE_READER');

export interface ConsentNoticeReader {
  getNotice(): { text: string; version: string } | null;
}
