import { ref } from 'vue'

export type InputDialogMode = 'input' | 'confirm' | 'text'

export interface InputDialogOptions {
  mode: InputDialogMode
  /** 标题文字（input 模式可传数组对应多个输入框的 label） */
  title?: string | string[]
  /** 输入框占位符/初始值 */
  placeholders?: string[]
  /** 是否允许空值提交，仅 input 模式有效，默认 false */
  allowEmpty?: boolean
  /** 输入框的 type 类型，如 'text', 'password' 等，默认为 'text' */
  inputTypes?: string[]
  /**
   * 自定义校验函数，仅 input 模式有效。
   * 返回错误信息字符串则显示警告且不提交，返回 null 则通过。
   */
  validate?: (values: string[]) => string | null
}

/**
 * 管理输入弹窗的 Promise 生命周期。
 *
 * 调用方只需 `const result = await dialog.show({ mode, title, ... })`，
 * 无需手动管理 resolve/reject 和 Pinia store。
 */
export function useInputDialog() {
  const visible = ref(false)
  const mode = ref<InputDialogMode>('input')
  const titles = ref<string[]>([''])
  const placeholders = ref<string[]>([''])
  const allowEmpty = ref(false)
  const inputTypes = ref<string[]>(['text'])
  const validate = ref<((values: string[]) => string | null) | null>(null)

  let resolvePromise: ((value: unknown) => void) | null = null
  let rejectPromise: ((reason?: unknown) => void) | null = null

  /**
   * 打开输入弹窗，返回 Promise。
   *
   * - input 模式  → resolve(values: string[])
   * - confirm 模式 → resolve(true)
   * - text 模式    → resolve(true)
   * - 取消/关闭    → reject(null)
   */
  function show(options: InputDialogOptions): Promise<unknown> {
    mode.value = options.mode
    titles.value = Array.isArray(options.title)
      ? options.title
      : [options.title ?? '']
    placeholders.value = options.placeholders ?? ['']
    allowEmpty.value = options.allowEmpty ?? false
    inputTypes.value = options.inputTypes ?? ['text']
    validate.value = options.validate ?? null
    visible.value = true

    return new Promise<unknown>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
  }

  function resolve(value: unknown) {
    resolvePromise?.(value)
    cleanup()
  }

  function reject(reason?: unknown) {
    rejectPromise?.(reason)
    cleanup()
  }

  function cleanup() {
    resolvePromise = null
    rejectPromise = null
    validate.value = null
    visible.value = false
  }

  return {
    /** 响应式状态 — 直接绑定到 InputModal */
    visible,
    mode,
    titles,
    placeholders,
    allowEmpty,
    inputTypes,
    validate,
    /** 打开弹窗，返回 Promise */
    show,
    /** 供 InputModal 内部调用以 resolve Promise */
    resolve,
    /** 供 InputModal 内部调用以 reject Promise */
    reject,
  }
}
