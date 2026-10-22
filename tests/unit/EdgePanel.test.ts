// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import EdgePanel from '@/components/EdgePanel.vue'
import TownSquare from '@/components/TownSquare.vue'

const wrappers: VueWrapper[] = []
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

function create(id = 'test-npc', tokens = false) {
  const wrapper = mount(EdgePanel, {
    props: { id, label: 'NPC', index: 2, open: true, width: 330, height: 180, tokensOnlyAtRest: tokens },
    slots: { default: '<button class="action">管理角色</button><ul><li><div class="token">圆盘</div></li></ul>' },
  })
  wrappers.push(wrapper)
  const panel = wrapper.find('section').element as HTMLElement
  panel.getBoundingClientRect = () => ({
    left: parseFloat(panel.style.left) || 0, top: parseFloat(panel.style.top) || 200,
    width: parseFloat(panel.style.width), height: parseFloat(panel.style.height),
  }) as DOMRect
  return wrapper
}
function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }))
}

test('dragged position and resized dimensions survive collapse and remount', async () => {
  const wrapper = create()
  pointer(wrapper.find('.edge-panel-grip').element, 'pointerdown', 40, 210)
  pointer(window, 'pointermove', 240, 290)
  pointer(window, 'pointerup', 240, 290)
  await wrapper.vm.$nextTick()
  expect((wrapper.find('section').element as HTMLElement).style.left).toBe('200px')
  expect((wrapper.find('section').element as HTMLElement).style.top).toBe('280px')
  pointer(wrapper.find('.edge-panel-resize').element, 'pointerdown', 520, 450)
  pointer(window, 'pointermove', 620, 510)
  pointer(window, 'pointerup', 620, 510)
  await wrapper.setProps({ open: false })
  expect(wrapper.find('section').isVisible()).toBe(false)
  await wrapper.setProps({ open: true })
  expect((wrapper.find('section').element as HTMLElement).style.width).toBe('430px')
  expect((wrapper.find('section').element as HTMLElement).style.height).toBe('240px')
  wrapper.unmount()
  const restored = create()
  await restored.vm.$nextTick()
  expect((restored.find('section').element as HTMLElement).style.left).toBe('200px')
  expect((restored.find('section').element as HTMLElement).style.width).toBe('430px')
})

test('interactive content keeps its click and never starts a drag', async () => {
  const wrapper = create()
  pointer(wrapper.find('.action').element, 'pointerdown', 50, 230)
  pointer(window, 'pointermove', 250, 330)
  pointer(window, 'pointerup', 250, 330)
  await wrapper.vm.$nextTick()
  expect((wrapper.find('section').element as HTMLElement).style.left).toBe('')
})

test('locking sidebar movement keeps panel clicks but disables dragging and arrow movement', async () => {
  useAppStore().grimoire.allowTabMove = false
  const wrapper = create()
  pointer(wrapper.find('.edge-panel-grip').element, 'pointerdown', 40, 210)
  pointer(window, 'pointermove', 240, 290)
  pointer(window, 'pointerup', 240, 290)
  await wrapper.find('.edge-panel-grip').trigger('keydown', { key: 'ArrowRight' })
  expect(wrapper.find('section').classes()).not.toContain('is-floating')
  await wrapper.find('.reference-edge-tab').trigger('click')
  expect(wrapper.emitted('toggle')).toHaveLength(1)
})

test('edge tab recalls a floating panel without closing it or closing its neighbors', async () => {
  const wrapper = create()
  await wrapper.find('.edge-panel-grip').trigger('keydown', { key: 'ArrowRight' })
  expect(wrapper.find('section').classes()).toContain('is-floating')
  await wrapper.find('.reference-edge-tab').trigger('click')
  expect(wrapper.find('section').classes()).not.toContain('is-floating')
  expect(wrapper.emitted('toggle')).toBeUndefined()
  await wrapper.find('.reference-edge-tab').trigger('click')
  expect(wrapper.emitted('toggle')).toHaveLength(1)
})

test('resizing stays anchored at the viewport boundary', async () => {
  const wrapper = create()
  await wrapper.setProps({ tokensOnlyAtRest: true })
  await wrapper.setProps({ open: true })
  await wrapper.find('.edge-panel-grip').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
  const panel = wrapper.find('section').element as HTMLElement
  const left = panel.style.left
  pointer(wrapper.find('.edge-panel-resize').element, 'pointerdown', 350, 380)
  pointer(window, 'pointermove', 5000, 5000)
  await wrapper.vm.$nextTick()
  expect(panel.style.left).toBe(left)
  expect(parseFloat(panel.style.width)).toBe(window.innerWidth - parseFloat(left) - 8)
  pointer(window, 'pointermove', 330, 360)
  pointer(window, 'pointerup', 330, 360)
  await wrapper.vm.$nextTick()
  expect(panel.style.width).toBe('310px')
  expect(panel.style.left).toBe(left)
})

test('a token can be clicked normally, while dragging it suppresses the release click', async () => {
  const wrapper = create('tokens', true)
  const tokenClick = vi.fn()
  wrapper.find('.token').element.addEventListener('click', tokenClick)
  pointer(wrapper.find('.token').element, 'pointerdown', 40, 230)
  pointer(window, 'pointerup', 40, 230)
  await wrapper.find('.token').trigger('click')
  expect(tokenClick).toHaveBeenCalledTimes(1)
  pointer(wrapper.find('.token').element, 'pointerdown', 40, 230)
  pointer(window, 'pointermove', 240, 290)
  pointer(window, 'pointerup', 240, 290)
  await wrapper.vm.$nextTick()
  await wrapper.find('.token').trigger('click')
  expect(tokenClick).toHaveBeenCalledTimes(1)
  expect(wrapper.find('section').classes()).toContain('is-floating')
})

test('viewport changes keep the entire floating panel reachable and Home restores its dock', async () => {
  const wrapper = create()
  await wrapper.find('.edge-panel-grip').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
  await wrapper.find('.edge-panel-grip').trigger('keydown', { key: 'ArrowDown', shiftKey: true })
  pointer(wrapper.find('.edge-panel-grip').element, 'pointerdown', 50, 230)
  pointer(window, 'pointermove', 5000, 5000)
  pointer(window, 'pointerup', 5000, 5000)
  await wrapper.vm.$nextTick()
  const panel = wrapper.find('section').element as HTMLElement
  expect(parseFloat(panel.style.left)).toBeLessThanOrEqual(window.innerWidth - 330)
  expect(parseFloat(panel.style.top)).toBeLessThanOrEqual(window.innerHeight - 180)
  await wrapper.find('.edge-panel-grip').trigger('keydown', { key: 'Home' })
  expect(panel.style.left).toBe('')
  expect(panel.style.top).toBe('')
})

test('toggling a sidebar leaves the other panels open', () => {
  const context = {
    isVoiceOpen: true, isFabledOpen: true, isBluffsOpen: true,
    session: { isChatOpen: true }, isChatMin: false,
    minimiseChat: vi.fn(), openPublicChat: vi.fn(),
  }
  TownSquare.methods!.toggleLeftPanel.call(context, 'npc')
  expect(context.isFabledOpen).toBe(false)
  expect(context.isVoiceOpen).toBe(true)
  expect(context.isBluffsOpen).toBe(true)
  expect(context.isChatMin).toBe(false)
})
