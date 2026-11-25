import { contactKeys } from '../../crm/contact-keys';

export function parseYCloudTestSenders(value: string): string[] {
  if (!value.trim()) return [];
  return [
    ...new Set(
      value.split(',').map((entry) => {
        const phone = entry.trim();
        const key = phone.startsWith('+') && contactKeys(null, phone).phoneKey;
        if (!key) throw new Error('YCLOUD_TEST_SENDERS_INVALID');
        return key;
      }),
    ),
  ];
}

export type YCloudTestPolicy = {
  allowNonAdTestMessages?: boolean;
  testSenders?: readonly string[];
};

export function ycloudAdmission(
  sourceType: unknown,
  phoneKey: string | null,
  cfg: YCloudTestPolicy,
) {
  const isAd = sourceType === 'ad';
  const isTestMessage =
    !isAd &&
    cfg.allowNonAdTestMessages === true &&
    !!phoneKey &&
    cfg.testSenders?.includes(phoneKey) === true;
  return { allowed: isAd || isTestMessage, isTestMessage };
}
