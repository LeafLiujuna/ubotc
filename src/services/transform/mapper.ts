// 数据映射工具

type RecordValue = Record<string, unknown>;
type MappingRule = Record<string, string>;

/**
 * 映射对象字段
 */
export const mapObject = (source: RecordValue | null | undefined, mapping: MappingRule | null | undefined): RecordValue => {
  if (!source || !mapping) return {};

  const result: RecordValue = {};

  for (const [targetKey, sourceKey] of Object.entries(mapping)) {
    if (sourceKey in source) {
      result[targetKey] = source[sourceKey];
    }
  }

  return result;
};

/**
 * 映射数组中的每个对象
 */
export const mapArray = (sourceArray: unknown, mapping: MappingRule): RecordValue[] => {
  if (!Array.isArray(sourceArray)) return [];
  return sourceArray.map((item) => mapObject((item ?? {}) as RecordValue, mapping));
};

/**
 * 深拷贝对象
 */
export const deepClone = <T>(source: T): T => {
  if (source === null || typeof source !== "object") return source;
  if (source instanceof Date) return new Date(source.getTime()) as T;
  if (Array.isArray(source)) return source.map((item) => deepClone(item)) as T;

  const clonedObj: RecordValue = {};
  for (const key in source as RecordValue) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      clonedObj[key] = deepClone((source as RecordValue)[key]);
    }
  }
  return clonedObj as T;
};

/**
 * 合并对象
 */
export const mergeObjects = <T extends RecordValue, U extends RecordValue>(target: T | null | undefined, source: U | null | undefined): T | U | (T & U) => {
  if (!target) return (source ?? {}) as U;
  if (!source) return target;

  const result: RecordValue = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      if (typeof sourceValue === "object" && sourceValue !== null && !Array.isArray(sourceValue)) {
        result[key] = mergeObjects((result[key] as RecordValue) ?? {}, sourceValue as RecordValue);
      } else {
        result[key] = sourceValue;
      }
    }
  }

  return result as T & U;
};