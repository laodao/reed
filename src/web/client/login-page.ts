/**
 * Web 端登录 / 注册页面
 * @module web/client/login-page
 * @description 不依赖 Vue / ElementPlus（避免与主 App 互相影响），用 DOM API
 *              手动渲染最小化登录 UI。
 */

const STYLE = `
.tb-auth-wrap {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #f0f2f5 0%, #e6eaf0 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
.tb-auth-card {
  background: #fff;
  width: 380px;
  max-width: 90vw;
  padding: 40px 36px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}
.tb-auth-title {
  margin: 0 0 8px;
  font-size: 22px;
  color: #1f2329;
  text-align: center;
}
.tb-auth-sub {
  margin: 0 0 24px;
  font-size: 13px;
  color: #8a939c;
  text-align: center;
}
.tb-auth-tabs {
  display: flex;
  margin-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}
.tb-auth-tab {
  flex: 1;
  padding: 10px 0;
  text-align: center;
  cursor: pointer;
  color: #6b7280;
  font-size: 14px;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.tb-auth-tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 500;
}
.tb-auth-form { display: flex; flex-direction: column; gap: 14px; }
.tb-auth-input {
  height: 40px;
  padding: 0 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.tb-auth-input:focus { border-color: #2563eb; }
.tb-auth-btn {
  height: 40px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.tb-auth-btn:hover:not(:disabled) { background: #1d4ed8; }
.tb-auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.tb-auth-msg { font-size: 13px; min-height: 18px; }
.tb-auth-msg.error { color: #dc2626; }
.tb-auth-msg.success { color: #059669; }
`

type Mode = 'login' | 'register'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text != null) node.textContent = text
  return node
}

export function mountLoginPage(selector: string, onSuccess: () => void): void {
  const root = document.querySelector(selector) as HTMLElement | null
  if (!root) {
    console.error('[login-page] root not found:', selector)
    return
  }
  // 注入样式
  if (!document.getElementById('tb-auth-style')) {
    const styleEl = document.createElement('style')
    styleEl.id = 'tb-auth-style'
    styleEl.textContent = STYLE
    document.head.appendChild(styleEl)
  }

  let mode: Mode = 'login'

  const render = (): void => {
    // 清空 root
    while (root.firstChild) root.removeChild(root.firstChild)

    const wrap = el('div', 'tb-auth-wrap')
    const card = el('div', 'tb-auth-card')
    wrap.appendChild(card)

    card.appendChild(el('h1', 'tb-auth-title', 'The Bot'))
    card.appendChild(
      el('p', 'tb-auth-sub', mode === 'login' ? '登录到你的账号' : '创建新账号'),
    )

    const tabs = el('div', 'tb-auth-tabs')
    const tabLogin = el('div', 'tb-auth-tab' + (mode === 'login' ? ' active' : ''), '登录')
    const tabRegister = el(
      'div',
      'tb-auth-tab' + (mode === 'register' ? ' active' : ''),
      '注册',
    )
    tabLogin.addEventListener('click', () => {
      mode = 'login'
      render()
    })
    tabRegister.addEventListener('click', () => {
      mode = 'register'
      render()
    })
    tabs.appendChild(tabLogin)
    tabs.appendChild(tabRegister)
    card.appendChild(tabs)

    const form = el('form', 'tb-auth-form')

    const emailInput = el('input', 'tb-auth-input') as HTMLInputElement
    emailInput.name = 'email'
    emailInput.type = 'email'
    emailInput.placeholder = '邮箱'
    emailInput.required = true
    emailInput.autocomplete = 'email'
    form.appendChild(emailInput)

    const passwordInput = el('input', 'tb-auth-input') as HTMLInputElement
    passwordInput.name = 'password'
    passwordInput.type = 'password'
    passwordInput.placeholder = '密码（至少 6 位）'
    passwordInput.minLength = 6
    passwordInput.required = true
    passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password'
    form.appendChild(passwordInput)

    let displayNameInput: HTMLInputElement | null = null
    if (mode === 'register') {
      displayNameInput = el('input', 'tb-auth-input') as HTMLInputElement
      displayNameInput.name = 'displayName'
      displayNameInput.type = 'text'
      displayNameInput.placeholder = '昵称（可选）'
      form.appendChild(displayNameInput)
    }

    const submitBtn = el(
      'button',
      'tb-auth-btn',
      mode === 'login' ? '登录' : '注册并登录',
    ) as HTMLButtonElement
    submitBtn.type = 'submit'
    form.appendChild(submitBtn)

    const msg = el('div', 'tb-auth-msg')
    form.appendChild(msg)

    form.addEventListener('submit', async ev => {
      ev.preventDefault()
      msg.textContent = ''
      msg.className = 'tb-auth-msg'
      submitBtn.disabled = true
      try {
        const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
        const body: Record<string, string> =
          mode === 'login'
            ? { email: emailInput.value.trim(), password: passwordInput.value }
            : {
                email: emailInput.value.trim(),
                password: passwordInput.value,
                ...(displayNameInput?.value.trim()
                  ? { displayName: displayNameInput.value.trim() }
                  : {}),
              }
        const resp = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const data = await resp.json()
        if (resp.ok && data.ok) {
          msg.textContent = '登录成功，正在加载...'
          msg.className = 'tb-auth-msg success'
          setTimeout(onSuccess, 200)
        } else {
          msg.textContent = data.error ?? `请求失败 (${resp.status})`
          msg.className = 'tb-auth-msg error'
        }
      } catch (e: any) {
        msg.textContent = e?.message ?? '网络错误'
        msg.className = 'tb-auth-msg error'
      } finally {
        submitBtn.disabled = false
      }
    })

    card.appendChild(form)
    root.appendChild(wrap)
  }

  render()
}
