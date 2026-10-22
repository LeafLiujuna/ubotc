// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import RightReferencePanel from '@/components/RightReferencePanel.vue'

const wrappers: VueWrapper[] = []
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
function create(id = 'roles') {
  const wrapper = mount(RightReferencePanel, {
    attachTo: document.body,
    props: { id, label: id === 'roles' ? '角色' : '夜间顺序', title: '剧本资料', index: id === 'roles' ? 0 : 1 },
    slots: { default: '<button class="content-action">唤醒标记</button>' },
  })
  wrappers.push(wrapper)
  const panel = wrapper.find('section').element as HTMLElement
  panel.getBoundingClientRect = () => ({ left: parseFloat(panel.style.left) || 350, top: parseFloat(panel.style.top) || 60,
    width: parseFloat(panel.style.width), height: parseFloat(panel.style.height) || 500 }) as DOMRect
  return wrapper
}
function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }))
}
test('one click shows names, the second shows abilities, and the third closes', async () => {
  const wrapper = create()
  expect(wrapper.find('section').isVisible()).toBe(false)
  await wrapper.find('.right-reference-tab').trigger('click')
  expect(wrapper.find('section').isVisible()).toBe(true)
  expect(wrapper.find('section').classes()).toContain('is-compact')
  await wrapper.find('.right-reference-tab').trigger('click')
  expect(wrapper.find('section').isVisible()).toBe(true)
  expect(wrapper.find('section').classes()).not.toContain('is-compact')
  await wrapper.find('.right-reference-tab').trigger('click')
  expect(wrapper.find('section').isVisible()).toBe(false)
})

test('locking sidebar movement disables pointer and keyboard movement without blocking opening', async () => {
  useAppStore().grimoire.allowTabMove = false
  const wrapper = create()
  await wrapper.find('.right-reference-tab').trigger('click')
  await wrapper.find('.right-reference-title').trigger('keydown', { key: 'ArrowLeft' })
  pointer(wrapper.find('.right-reference-title').element, 'pointerdown', 400, 80)
  pointer(window, 'pointermove', 600, 200)
  pointer(window, 'pointerup', 600, 200)
  expect(wrapper.find('section').classes()).not.toContain('is-floating')
  expect(wrapper.find('section').isVisible()).toBe(true)
})
test('dragged layout survives remounting and its edge tab recalls it to the narrow dock', async () => {
  const wrapper = create()
  await wrapper.find('.right-reference-tab').trigger('click')
  await wrapper.find('.right-reference-tab').trigger('click')
  pointer(wrapper.find('.right-reference-title').element, 'pointerdown', 500, 80)
  pointer(window, 'pointermove', 300, 130)
  pointer(window, 'pointerup', 300, 130)
  await wrapper.vm.$nextTick()
  const panel = wrapper.find('section').element as HTMLElement
  expect(panel.style.left).toBe('150px')
  expect(panel.style.top).toBe('110px')
  // Release-generated click is consumed, then the explicit close works.
  await wrapper.find('.right-reference-title').trigger('click')
  await wrapper.findAll('.right-reference-tools button').at(-1)!.trigger('click')
  expect(wrapper.find('section').isVisible()).toBe(false)
  wrapper.unmount()
  const restored = create()
  await restored.vm.$nextTick()
  expect((restored.find('section').element as HTMLElement).style.left).toBe('150px')
  await restored.find('.right-reference-tab').trigger('click')
  expect(restored.find('section').classes()).toContain('is-compact')
  expect(restored.find('section').classes()).not.toContain('is-floating')
  await restored.find('.right-reference-tab').trigger('click')
  expect(restored.find('section').classes()).not.toContain('is-compact')
  await restored.find('.right-reference-title').trigger('keydown', { key: 'Home' })
  expect(restored.find('section').classes()).not.toContain('is-floating')
})
test('night and role references keep independent visibility and content controls do not drag', async () => {
  const roles = create(), night = create('night')
  await roles.find('.right-reference-tab').trigger('click')
  await night.find('.right-reference-tab').trigger('click')
  pointer(night.find('.content-action').element, 'pointerdown', 400, 150)
  pointer(window, 'pointermove', 200, 250)
  pointer(window, 'pointerup', 200, 250)
  await night.vm.$nextTick()
  expect(night.find('section').classes()).not.toContain('is-floating')
  await night.find('.right-reference-tab').trigger('click')
  await night.find('.right-reference-tab').trigger('click')
  expect(roles.find('section').isVisible()).toBe(true)
  expect(night.find('section').isVisible()).toBe(false)
})
test('the compact sheet can be dragged out by its paper without activating content controls', async () => {
  const wrapper = create('night')
  await wrapper.find('.right-reference-tab').trigger('click')
  pointer(wrapper.find('.right-reference-content').element, 'pointerdown', 400, 150)
  pointer(window, 'pointermove', 250, 200)
  pointer(window, 'pointerup', 250, 200)
  await wrapper.vm.$nextTick()
  expect(wrapper.find('section').classes()).toContain('is-floating')
  expect(wrapper.find('section').classes()).not.toContain('is-compact')
  expect((wrapper.find('section').element as HTMLElement).style.left).toBe('200px')
})
test('resize and viewport changes keep the floating sheet on screen', async () => {
  const wrapper = create()
  await wrapper.find('.right-reference-tab').trigger('click')
  await wrapper.find('.right-reference-tab').trigger('click')
  pointer(wrapper.find('.right-reference-resize').element, 'pointerdown', 1000, 550)
  pointer(window, 'pointermove', 5000, 5000)
  pointer(window, 'pointerup', 5000, 5000)
  await wrapper.vm.$nextTick()
  const panel = wrapper.find('section').element as HTMLElement
  expect(parseFloat(panel.style.width)).toBeLessThanOrEqual(window.innerWidth - 40)
  expect(parseFloat(panel.style.height)).toBeLessThanOrEqual(window.innerHeight - 24)
  expect(parseFloat(panel.style.left) + parseFloat(panel.style.width)).toBeLessThanOrEqual(window.innerWidth)
})

test('resizing keeps the top-left anchored at the viewport boundary and reverses without drift', async () => {
  const wrapper = create()
  await wrapper.find('.right-reference-tab').trigger('click')
  await wrapper.find('.right-reference-tab').trigger('click')
  const panel = wrapper.find('section').element as HTMLElement
  const initialWidth = parseFloat(panel.style.width)
  pointer(wrapper.find('.right-reference-resize').element, 'pointerdown', 1000, 550)
  pointer(window, 'pointermove', 5000, 5000)
  await wrapper.vm.$nextTick()
  expect(panel.style.left).toBe('350px')
  expect(panel.style.top).toBe('60px')
  expect(parseFloat(panel.style.width)).toBe(window.innerWidth - 350 - 8)
  expect(parseFloat(panel.style.height)).toBe(window.innerHeight - 60 - 8)
  expect(wrapper.find('section').classes()).toContain('is-interacting')
  pointer(window, 'pointermove', 950, 500)
  pointer(window, 'pointerup', 950, 500)
  await wrapper.vm.$nextTick()
  expect(panel.style.width).toBe(`${initialWidth - 50}px`)
  expect(panel.style.height).toBe('450px')
  expect(panel.style.left).toBe('350px')
  expect(wrapper.find('section').classes()).not.toContain('is-interacting')
})

test('arrow keys resize from the same anchor and text zoom survives reopening', async () => {
  const wrapper = create()
  await wrapper.find('.right-reference-tab').trigger('click')
  await wrapper.find('.right-reference-tab').trigger('click')
  const panel = wrapper.find('section').element as HTMLElement
  const initialWidth = parseFloat(panel.style.width)
  await wrapper.find('.right-reference-resize').trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
  expect(parseFloat(panel.style.width)).toBeCloseTo(initialWidth - 32)
  expect(panel.style.left).toBe('350px')
  await wrapper.find('[aria-label="缩小角色文字"]').trigger('click')
  expect(panel.style.getPropertyValue('--reference-text-size')).toBe('13px')
  wrapper.unmount()
  const restored = create()
  await restored.vm.$nextTick()
  expect((restored.find('section').element as HTMLElement).style.getPropertyValue('--reference-text-size')).toBe('13px')
})
