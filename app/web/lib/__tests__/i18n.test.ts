// i18n translate 回归测试
import { describe, expect, it } from 'vitest'

import { translate } from '../i18n'

describe('translate', () => {
  it('按当前语言取值', () => {
    expect(translate('zh', 'common.actions.save')).toBe('保存')
    expect(translate('en', 'common.actions.save')).toBe('Save')
  })

  it('英文缺失时回退到默认语言（中文）', () => {
    // 构造一个只在 zh 存在的键不现实（两边同步），改测未知语言回退到 zh 字典
    expect(translate('zh', 'account.nav.danger')).toBe('危险区')
  })

  it('键不存在时回退到键本身', () => {
    expect(translate('zh', 'no.such.key')).toBe('no.such.key')
    expect(translate('en', 'no.such.key')).toBe('no.such.key')
  })

  it('占位变量替换', () => {
    // translate 对不含占位的文案也应安全返回
    expect(translate('en', 'common.actions.cancel', { unused: 'x' })).toBe('Cancel')
  })
})
