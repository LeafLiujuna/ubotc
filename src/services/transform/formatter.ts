// 数据格式化工具

export type NumberFormatOptions = {
  decimalPlaces?: number;
  thousandsSeparator?: string;
  decimalSeparator?: string;
};

export type StringFormatOptions = {
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  capitalize?: boolean;
};

/**
 * 格式化日期
 */
export const formatDate = (date: Date | string | number, format = "YYYY-MM-DD HH:mm:ss"): string => {
  const d = new Date(date);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  return format
    .replace("YYYY", String(year))
    .replace("MM", month)
    .replace("DD", day)
    .replace("HH", hours)
    .replace("mm", minutes)
    .replace("ss", seconds);
};

/**
 * 格式化数字
 */
export const formatNumber = (value: number, options: NumberFormatOptions = {}): string => {
  const {
    decimalPlaces = 2,
    thousandsSeparator = ",",
    decimalSeparator = ".",
  } = options;

  return value
    .toFixed(decimalPlaces)
    .replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator)
    .replace(".", decimalSeparator);
};

/**
 * 格式化货币
 */
export const formatCurrency = (amount: number, currency = "¥", options: NumberFormatOptions = {}): string => {
  return `${currency}${formatNumber(amount, options)}`;
};

/**
 * 格式化字符串
 */
export const formatString = (str: string, options: StringFormatOptions = {}): string => {
  const {
    trim = true,
    lowercase = false,
    uppercase = false,
    capitalize = false,
  } = options;

  let result = str;

  if (trim) {
    result = result.trim();
  }

  if (lowercase) {
    result = result.toLowerCase();
  }

  if (uppercase) {
    result = result.toUpperCase();
  }

  if (capitalize) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  return result;
};