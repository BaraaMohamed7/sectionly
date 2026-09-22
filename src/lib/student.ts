export type AcademicLevel = 1 | 2 | 3 | 4;

export function getAcademicLevel(completedCreditHours: number): AcademicLevel {
  if (completedCreditHours < 32) return 1;
  if (completedCreditHours <= 65) return 2;
  if (completedCreditHours <= 98) return 3;
  return 4;
}
