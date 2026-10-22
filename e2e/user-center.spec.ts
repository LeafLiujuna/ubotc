import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('user center saves real profile and privacy settings across reloads', async ({ page, request }, info) => {
  test.skip(process.env.E2E_FULL_STACK !== 'true', 'Requires the isolated full-stack runner')
  const lobby = process.env.E2E_LOBBY_URL!
  const login = await request.post(`${lobby}/api/auth/dev-login`, { data: { identity: 'player', clientId: `account-${randomUUID()}` } })
  expect(login.ok()).toBeTruthy()
  const { token } = (await login.json()).data
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(value => localStorage.setItem('ubotc_token', value), token)
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: '用户中心', exact: true })).toBeVisible()
  await expect(page.getByText('最近登录 IP', { exact: true })).toBeVisible()
  const nickname = `钟楼旅人 ${info.project.name}`
  await page.getByLabel('昵称', { exact: true }).fill(nickname)
  await page.getByRole('button', { name: '保存资料', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status')).toContainText('个人资料已保存')
  await page.getByRole('checkbox', { name: /隐藏我的对局/ }).check()
  await expect(page.getByRole('main').getByRole('status')).toContainText('隐私设置已保存')
  await page.reload()
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue(nickname)
  await expect(page.getByRole('checkbox', { name: /隐藏我的对局/ })).toBeChecked()
  await expect(page.getByText('还没有对局记录', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.screenshot({ path: info.outputPath('user-center.png'), fullPage: true, animations: 'disabled' })
  expect(errors).toEqual([])
})
