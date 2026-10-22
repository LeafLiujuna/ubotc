# 数据转换模块

## 简介

数据转换模块是前端框架的核心模块之一，负责处理前后端数据格式转换。它提供了数据映射、数据格式化等工具，使得前端能够更方便地处理后端返回的数据。

## 功能特性

- 数据映射：将后端数据结构映射到前端数据结构
- 数据格式化：格式化日期、数字、字符串等
- 深拷贝：深拷贝对象，避免引用问题
- 对象合并：合并多个对象

## 使用方法

### 安装

数据转换模块已经集成在前端框架中，无需单独安装。

### 导入

```javascript
import transformService from '@/services/transform'

// 或者单独导入某个工具
import { mapObject, mapArray } from '@/services/transform/mapper'
import { formatDate, formatNumber } from '@/services/transform/formatter'
```

### 基本用法

#### 数据映射

```javascript
// 映射对象
const source = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  created_at: '2023-01-01T00:00:00Z'
};

const mapping = {
  id: 'id',
  name: 'name',
  email: 'email',
  createdAt: 'created_at'
};

const mappedObject = transformService.mapObject(source, mapping);
console.log('Mapped object:', mappedObject);
// Output: { id: 1, name: 'John Doe', email: 'john@example.com', createdAt: '2023-01-01T00:00:00Z' }

// 映射数组
const sourceArray = [
  { id: 1, name: 'John Doe' },
  { id: 2, name: 'Jane Smith' }
];

const arrayMapping = {
  id: 'id',
  fullName: 'name'
};

const mappedArray = transformService.mapArray(sourceArray, arrayMapping);
console.log('Mapped array:', mappedArray);
// Output: [{ id: 1, fullName: 'John Doe' }, { id: 2, fullName: 'Jane Smith' }]
```

#### 深拷贝

```javascript
const source = {
  id: 1,
  name: 'John Doe',
  address: {
    street: '123 Main St',
    city: 'New York'
  }
};

const copy = transformService.deepClone(source);
copy.address.city = 'Los Angeles';

console.log('Source:', source.address.city); // Output: New York
console.log('Copy:', copy.address.city); // Output: Los Angeles
```

#### 对象合并

```javascript
const target = {
  id: 1,
  name: 'John Doe',
  address: {
    street: '123 Main St',
    city: 'New York'
  }
};

const source = {
  name: 'John Doe Updated',
  address: {
    city: 'Los Angeles'
  },
  email: 'john@example.com'
};

const merged = transformService.mergeObjects(target, source);
console.log('Merged:', merged);
// Output: {
//   id: 1,
//   name: 'John Doe Updated',
//   address: {
//     street: '123 Main St',
//     city: 'Los Angeles'
//   },
//   email: 'john@example.com'
// }
```

#### 日期格式化

```javascript
const date = new Date('2023-01-01T12:34:56Z');
const formattedDate = transformService.formatDate(date, 'YYYY-MM-DD HH:mm:ss');
console.log('Formatted date:', formattedDate); // Output: 2023-01-01 12:34:56
```

#### 数字格式化

```javascript
const number = 123456.789;
const formattedNumber = transformService.formatNumber(number, {
  decimalPlaces: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.'
});
console.log('Formatted number:', formattedNumber); // Output: 123,456.79
```

#### 货币格式化

```javascript
const amount = 123456.78;
const formattedCurrency = transformService.formatCurrency(amount, '¥', {
  decimalPlaces: 2
});
console.log('Formatted currency:', formattedCurrency); // Output: ¥123,456.78
```

#### 字符串格式化

```javascript
const str = '  john doe  ';
const formattedString = transformService.formatString(str, {
  trim: true,
  capitalize: true
});
console.log('Formatted string:', formattedString); // Output: John doe
```

## 最佳实践

1. 在服务封装模块中使用数据映射工具，将后端数据结构映射到前端数据结构
2. 在组件中使用数据格式化工具，格式化显示数据
3. 使用深拷贝工具避免对象引用问题
4. 使用对象合并工具合并默认值和用户输入

## 扩展功能

要扩展数据转换模块，只需在 `mapper.js` 或 `formatter.js` 中添加新的工具函数，然后在 `index.js` 中导出即可。
