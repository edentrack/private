export const formatCurrency = (amount: number, currency: string = 'XAF'): string => {
  try {
    return new Intl.NumberFormat('en-CM', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${formatNumber(amount)}`;
  }
};

export const formatNumber = (value: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

export const formatDecimal = (value: number, decimals: number = 2): string => {
  return formatNumber(value, decimals);
};

export const formatDate = (date: string | Date, format: 'short' | 'medium' | 'long' = 'medium'): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const options: Intl.DateTimeFormatOptions = {
    short: { year: 'numeric', month: 'numeric', day: 'numeric' },
    medium: { year: 'numeric', month: 'short', day: 'numeric' },
    long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
  }[format];

  return new Intl.DateTimeFormat('en-US', options).format(dateObj);
};

export const formatTime = (time: string | Date, includeSeconds: boolean = false): string => {
  const timeObj = typeof time === 'string' ? new Date(time) : time;

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds && { second: '2-digit' })
  }).format(timeObj);
};

export const formatDateTime = (dateTime: string | Date, format: 'short' | 'medium' | 'long' = 'medium'): string => {
  const dateObj = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;

  const options: Intl.DateTimeFormatOptions = {
    short: {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    },
    medium: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    },
    long: {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  }[format];

  return new Intl.DateTimeFormat('en-US', options).format(dateObj);
};

export const formatRelativeTime = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes === 0) {
        return 'Just now';
      }
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  return formatDate(dateObj, 'short');
};

export const formatPercentage = (value: number, decimals: number = 1): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value / 100);
};

export const formatWeight = (kg: number, unit: 'kg' | 'lb' = 'kg'): string => {
  const value = unit === 'lb' ? kg * 2.20462 : kg;
  const unitStr = unit === 'lb' ? 'lb' : 'kg';

  return `${formatDecimal(value, 2)} ${unitStr}`;
};

export const formatCompactNumber = (value: number): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short'
    }).format(value);
  } catch {
    if (value >= 1000000) {
      return `${formatDecimal(value / 1000000, 1)}M`;
    }
    if (value >= 1000) {
      return `${formatDecimal(value / 1000, 1)}K`;
    }
    return formatNumber(value);
  }
};
