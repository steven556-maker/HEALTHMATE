/** بيشيل رموز Markdown من رد المساعد علشان تظهر الرسالة نص عادي (الرسايل القديمة المحفوظة كمان). */
export function stripMarkdown(input: string): string {
  return input
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[*+]\s+/gm, "- ")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
