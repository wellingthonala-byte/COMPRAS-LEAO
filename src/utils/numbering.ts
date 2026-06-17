export function generateRequestNumber(createdAt: string, existingNumbers: string[]): string {
  const date = new Date(createdAt);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const prefix = `${month}/${year}`;

  const sameMonthNumbers = existingNumbers
    .filter((n) => n.endsWith(`/${prefix}`))
    .map((n) => parseInt(n.replace('#', '').split('/')[0], 10))
    .filter((n) => !isNaN(n));

  const next = sameMonthNumbers.length > 0 ? Math.max(...sameMonthNumbers) + 1 : 1;
  return `#${String(next).padStart(3, '0')}/${prefix}`;
}
