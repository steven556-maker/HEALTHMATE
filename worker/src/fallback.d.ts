export const fallbackData: {
  faq: { keywords: string[]; answer: string; answerEn: string }[];
  default: string;
  defaultEn: string;
};
export function normalizeArabic(value: string): string;
export function staticReply(question: string, locale?: string): string;
