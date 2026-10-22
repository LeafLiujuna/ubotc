// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import NightReferenceContent from '@/components/NightReferenceContent.vue'

const firstRole = { id: 'chef', name: '厨师', team: 'townsfolk', firstNightReminder: '告知相邻邪恶玩家的对数。', ability: '能力介绍', isWakeMarked: false, isConfigured: false }
const otherRole = { id: 'imp', name: '小恶魔', team: 'demon', otherNightReminder: '选择一名玩家。', isWakeMarked: true, isConfigured: true }
const sections = [
  { key: 'other', isCurrent: true, entries: [{ key: 'other-imp', number: 1, role: otherRole }] },
  { key: 'first', isCurrent: false, entries: [{ key: 'first-chef', number: 1, role: firstRole }] },
]
function create(canEdit = true) {
  return mount(NightReferenceContent, { props: { sections, canEdit }, global: { stubs: { RoleIcon: true } } })
}
test('starts on the current night and switches both names and wake instructions together', async () => {
  const wrapper = create()
  expect(wrapper.get('ol').attributes('aria-label')).toBe('其他夜晚唤醒顺序')
  expect(wrapper.text()).toContain('选择一名玩家。')
  const choices = wrapper.findAll('.night-sheet__switch button')
  expect(choices[0].text()).toBe('首个夜晚')
  await choices[0].trigger('click')
  expect(wrapper.get('ol').attributes('aria-label')).toBe('首个夜晚唤醒顺序')
  expect(wrapper.text()).toContain('告知相邻邪恶玩家的对数。')
  expect(wrapper.text()).not.toContain('能力介绍')
  expect(wrapper.findAll('.night-sheet__boundary strong').map(item => item.text())).toEqual(['黄昏', '黎明'])
  wrapper.unmount()
})
test('automatic and spectator markers stay disabled; editable markers retain section and role identity', async () => {
  const wrapper = create()
  expect(wrapper.get('.night-sheet__role-icon').attributes('disabled')).toBeDefined()
  await wrapper.findAll('.night-sheet__switch button')[0].trigger('click')
  await wrapper.get('.night-sheet__role-icon').trigger('click')
  expect(wrapper.emitted('toggle-marker')?.[0]).toEqual(['first', firstRole])
  await wrapper.setProps({ canEdit: false })
  expect(wrapper.get('.night-sheet__role-icon').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})
