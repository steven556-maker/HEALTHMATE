/** هل ينفع نزامن بيانات الجهاز مع الحساب ده؟ (جهاز مربوط بحساب تاني = لأ، عشان بيانات شخصين ما تتخلطش) */
export function canSyncLocalDataWithAccount(previousOwner: string | null, nextUserId: string): boolean {
  return previousOwner === null || previousOwner === nextUserId;
}
