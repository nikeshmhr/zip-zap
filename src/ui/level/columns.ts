/**
 * Truth-table columns: runs of pins named like A3, A2, A1, A0 (most significant first) are
 * shown as one column, "A", whose cells read as binary numbers such as 0101.
 */
export interface Column {
  label: string;
  pins: readonly string[];
}

const BIT = /^(.*?)(\d+)$/;

export function groupColumns(names: readonly string[]): Column[] {
  const columns: Column[] = [];
  let i = 0;
  while (i < names.length) {
    const match = BIT.exec(names[i]!);
    let j = i + 1;
    if (match) {
      const [, prefix, digits] = match;
      let expected = Number(digits) - 1;
      while (j < names.length && names[j] === `${prefix}${expected}`) {
        expected--;
        j++;
      }
      // Only a full run down to bit 0 reads as a binary number.
      if (j - i > 1 && expected === -1) {
        columns.push({ label: prefix!, pins: names.slice(i, j) });
        i = j;
        continue;
      }
    }
    columns.push({ label: names[i]!, pins: [names[i]!] });
    i++;
  }
  return columns;
}
