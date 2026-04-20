export function formatEggs(totalEggs: number, eggsPerTray?: number | null): string {
  if (!eggsPerTray || eggsPerTray === 0) {
    return totalEggs === 1 ? '1 egg' : `${totalEggs.toLocaleString()} eggs`;
  }

  if (totalEggs === 0) return '0 eggs';

  const trays = Math.floor(totalEggs / eggsPerTray);
  const remaining = totalEggs % eggsPerTray;

  if (trays === 0) {
    return `${totalEggs} ${totalEggs === 1 ? 'egg' : 'eggs'}`;
  }

  if (remaining === 0) {
    return `${trays} ${trays === 1 ? 'tray' : 'trays'}`;
  }

  return `${trays} ${trays === 1 ? 'tray' : 'trays'} + ${remaining} ${remaining === 1 ? 'egg' : 'eggs'}`;
}

export function getEggTotalLabel(totalEggs: number, eggsPerTray?: number | null): string | null {
  if (!eggsPerTray || eggsPerTray === 0) {
    return null;
  }

  const trays = Math.floor(totalEggs / eggsPerTray);
  if (trays === 0) {
    return null;
  }

  return `(${totalEggs.toLocaleString()} total)`;
}

export interface FormattedEggs {
  primary: string;
  secondary: string | null;
  totalEggs: number;
}

export function formatEggsWithTotal(totalEggs: number, eggsPerTray?: number | null): FormattedEggs {
  return {
    primary: formatEggs(totalEggs, eggsPerTray),
    secondary: getEggTotalLabel(totalEggs, eggsPerTray),
    totalEggs
  };
}

export function formatEggsForExport(totalEggs: number, eggsPerTray?: number | null): string {
  if (!eggsPerTray || eggsPerTray === 0) {
    return `${totalEggs} eggs`;
  }

  const trays = Math.floor(totalEggs / eggsPerTray);
  const remaining = totalEggs % eggsPerTray;

  if (trays === 0) {
    return `${totalEggs} eggs`;
  }

  return `${trays} trays + ${remaining} eggs (${totalEggs} total)`;
}

export function formatEggsCompact(totalEggs: number, eggsPerTray?: number | null): string {
  if (!eggsPerTray || eggsPerTray === 0) {
    return `${totalEggs.toLocaleString()} eggs`;
  }

  if (totalEggs === 0) return '0';

  const trays = Math.floor(totalEggs / eggsPerTray);
  const remaining = totalEggs % eggsPerTray;

  if (trays === 0) {
    return `${totalEggs} eggs`;
  }

  if (remaining === 0) {
    return `${trays.toLocaleString()} ${trays === 1 ? 'tray' : 'trays'}`;
  }

  return `${trays.toLocaleString()}(${remaining})`;
}
