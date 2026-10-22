// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import SettingsModal from '@/components/modals/SettingsModal.vue'
import { useAppStore } from '@/stores/app'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { UserApi } from '@/api/http/user'
import { resolveProfileAvatar } from '@/utils/profileAvatars'
import { effectScope, nextTick } from 'vue'
import { installDisplayPreferences } from '@/services/displayPreferences'
import { DISPLAY_SETTINGS_KEY } from '@/utils/settingsStorage'
import { motionEnabled, setAppMotionEnabled } from '@/composables/useMotion'

function getButton(wrapper, text) {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

function mountSettings() {
  const appStore = useAppStore()
  if (!appStore.modals.settings) appStore.toggleModal('settings')
  return mount(SettingsModal, {
    global: {
      stubs: {
        Modal: { template: '<div role="dialog"><slot /></div>' },
        'font-awesome-icon': { template: '<i />' },
      },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SettingsModal', () => {
  test('persists display preferences without rewriting custom CSS for unrelated controls', async () => {
    const scope = effectScope()
    const app = useAppStore()
    const cssChanged = vi.fn()
    const observer = new MutationObserver(cssChanged)
    try {
      scope.run(installDisplayPreferences)
      const style = document.getElementById('ts-custom-settings-css')
      // jsdom 尚不能解析 @scope；此处验证样式节点更新，不测试 CSS 渲染。
      style.type = 'text/plain'
      observer.observe(style, { childList: true })
      app.grimoire.soundVolume = 40
      await nextTick()
      expect(JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY)).soundVolume).toBe(40)
      expect(cssChanged).not.toHaveBeenCalled()
      app.grimoire.customCss = '.token { opacity: .8; }'
      app.grimoire.customCssEnabled = true
      await nextTick()
      expect(style.textContent).toContain('@scope (#townsquare)')
      expect(style.textContent).toContain('.token { opacity: .8; }')
      app.grimoire.showAnimations = false
      await nextTick()
      expect(motionEnabled.value).toBe(false)
      expect(document.documentElement.classList.contains('ts-reduce-motion')).toBe(true)
      expect(cssChanged).toHaveBeenCalledTimes(1)
      app.grimoire.customCssEnabled = false
      await nextTick()
      expect(style.textContent).toBe('')
    } finally {
      observer.disconnect()
      scope.stop()
      document.getElementById('ts-custom-settings-css')?.remove()
      document.documentElement.classList.remove('ts-reduce-motion')
      setAppMotionEnabled(true)
    }
  })

  test('offers only avatar uploads and restores an uploaded avatar and nickname appearance', async () => {
    const uploaded = 'data:image/webp;base64,test'
    localStorage.setItem('ts-user-appearance:v1:guest', JSON.stringify({ avatar: uploaded, frame: 0 }))
    const wrapper = mountSettings()
    await getButton(wrapper, '用户').trigger('click')
    expect(wrapper.get('.avatar-button img').attributes('src')).toBe(uploaded)
    await wrapper.get('[aria-label="更换头像"]').trigger('click')
    expect(wrapper.findAll('.avatar-option')).toHaveLength(1)
    expect(wrapper.find('.avatar-option--upload').text()).toBe('上传头像')
    expect(wrapper.find('.user-avatar-upload img').exists()).toBe(false)
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    await getButton(wrapper, '返回用户资料').trigger('click')
    expect(useSessionStore().playerAvatar).toBe(uploaded)
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    await wrapper.get('[aria-label="下一种昵称外观"]').trigger('click')
    expect(wrapper.get('.user-profile-card').classes()).toContain('user-profile-card--1')
    wrapper.unmount()

    const restored = mountSettings()
    await getButton(restored, '用户').trigger('click')
    expect(restored.get('.avatar-button img').attributes('src')).toBe(uploaded)
    expect(restored.get('.user-profile-card').classes()).toContain('user-profile-card--1')
    expect(resolveProfileAvatar(uploaded)).toBe(uploaded)
    expect(resolveProfileAvatar('builtin:portrait-08')).toBe('')
    restored.unmount()
  })

  test('uses real statistics and only changes visibility after a successful save', async () => {
    const user = useUserStore()
    user.setCurrentUser({ id: 'test-user', displayName: '测试玩家', level: 1, storytellerLevel: 2,
      createdAt: 1760000000, lastSeenAt: 1760000000, hideGameResults: false,
      stats: { dmCount: 2, totalGames: 5, favoriteScript: '暗流涌动', favoriteStartingCharacter: 'chef' },
    })
    vi.spyOn(user, 'refreshCurrentUserInfo').mockResolvedValue()
    const save = vi.spyOn(UserApi, 'setGameResultsHidden')
      .mockResolvedValueOnce({ status: 200, data: { hideGameResults: true } })
      .mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountSettings()
    await getButton(wrapper, '用户').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.user-stat-value').map(value => value.text())).toEqual(['2', '3', '暗流涌动', '厨师'])
    await wrapper.get('.user-stat-visibility').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith(true)
    expect(wrapper.get('.user-stats').classes()).toContain('is-private')
    await wrapper.get('.user-stat-visibility').trigger('click')
    await flushPromises()
    expect(user.current.hideGameResults).toBe(true)
    expect(wrapper.text()).toContain('统计可见性保存失败')
    wrapper.unmount()
  })

  test('returns to the user page after changing the nickname', async () => {
    const wrapper = mountSettings()
    const app = useAppStore(), session = useSessionStore()
    await getButton(wrapper, '用户').trigger('click')
    await wrapper.get('[aria-label="修改昵称"]').trigger('click')
    expect(app.modals.input).toBe(true)
    expect(wrapper.find('.settings-modal').exists()).toBe(false)
    session.inputResolver?.(['新的昵称'])
    app.toggleModal('input')
    await flushPromises()
    expect(session.playerName).toBe('新的昵称')
    expect(wrapper.get('.user-nameplate').text()).toBe('新的昵称')
    expect(wrapper.get('[aria-selected="true"]').text()).toBe('用户')
    wrapper.unmount()
  })

  test('keeps the categories in order and removes rule options from extra settings', async () => {
    const wrapper = mountSettings()
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual([
      '常规', '用户', '聊天', '游戏', '快捷键', '高级选项', '扩展',
    ])
    await getButton(wrapper, '游戏').trigger('click')
    expect(wrapper.text()).toContain('堆叠提示标记')
    expect(wrapper.text()).not.toContain('兼容旧角色能力')
    await getButton(wrapper, '扩展').trigger('click')
    for (const label of ['兼容旧夜晚顺序', '兼容旧角色能力', '角色合集范围', '私货商人规则', '选择剧本', '配置角色', '传奇角色']) {
      expect(wrapper.text()).not.toContain(label)
    }
    expect(wrapper.text()).toContain('允许加载远程角色图标')
    expect(wrapper.text()).toContain('语音活动检测与连接诊断')
    expect(wrapper.text()).toContain('重置浮层布局')
  })

  test('applies display controls and cancels background edits without losing the current image', async () => {
    const app = useAppStore()
    app.grimoire.background = 'https://example.com/original.jpg'
    const wrapper = mountSettings()
    await wrapper.get('input[type="range"]').setValue(150)
    expect(app.grimoire.avatarScale).toBe(150)
    await wrapper.get('[aria-label="显示动画"]').trigger('click')
    expect(app.grimoire.showAnimations).toBe(false)
    expect(app.grimoire.isStatic).toBe(true)
    await wrapper.get('[aria-label="设置背景图片"]').trigger('click')
    await wrapper.get('#settings-background').setValue('https://example.com/new.jpg')
    await getButton(wrapper, '取消').trigger('click')
    expect(app.grimoire.background).toBe('https://example.com/original.jpg')
  })


})
