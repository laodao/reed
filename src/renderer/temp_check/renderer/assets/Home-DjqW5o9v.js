import { d as defineComponent, t as markRaw, v as chat_dot_round_default, x as picture_default, y as document_default, z as microphone_default, A as magic_stick_default, B as setting_default, C as createElementBlock, D as createBaseVNode, F as createStaticVNode, G as Fragment, H as renderList, e as createTextVNode, I as useRouter, f as resolveComponent, o as openBlock, J as normalizeClass, c as createBlock, K as resolveDynamicComponent, L as toDisplayString, b as createVNode, a as withCtx, M as unref, N as arrow_right_default, r as ref, _ as _export_sfc } from "./index-CEiunyEa.js";
const _hoisted_1 = { class: "home-page" };
const _hoisted_2 = { class: "home-content" };
const _hoisted_3 = { class: "feature-grid" };
const _hoisted_4 = ["onClick", "onMouseenter"];
const _hoisted_5 = { class: "feature-content" };
const _hoisted_6 = { class: "feature-title" };
const _hoisted_7 = { class: "feature-desc" };
const _hoisted_8 = { class: "feature-arrow" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Home",
  setup(__props) {
    const router = useRouter();
    const hoveredCard = ref(null);
    const features = [
      {
        path: "/chat",
        title: "AI 对话",
        description: "与 AI 进行智能对话，支持多种大模型",
        icon: markRaw(chat_dot_round_default)
      },
      {
        path: "/image",
        title: "图像生成",
        description: "使用 AI 生成创意图像",
        icon: markRaw(picture_default)
      },
      {
        path: "/translate",
        title: "文档翻译",
        description: "智能翻译多种语言文档",
        icon: markRaw(document_default)
      },
      {
        path: "/voice",
        title: "语音助手",
        description: "语音识别与语音合成",
        icon: markRaw(microphone_default)
      },
      {
        path: "/assistant",
        title: "智能助手",
        description: "自动化任务与智能推荐",
        icon: markRaw(magic_stick_default)
      },
      {
        path: "/settings",
        title: "系统设置",
        description: "配置 API 密钥、主题和语言",
        icon: markRaw(setting_default)
      }
    ];
    const navigateTo = (path) => {
      router.push(path);
    };
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[2] || (_cache[2] = createStaticVNode('<div class="welcome-section" data-v-1bf5a672><div class="welcome-icon" data-v-1bf5a672><svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" data-v-1bf5a672><circle cx="32" cy="32" r="28" fill="url(#homeGradient)" data-v-1bf5a672></circle><path d="M24 32L30 38L40 26" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" data-v-1bf5a672></path><defs data-v-1bf5a672><linearGradient id="homeGradient" x1="0%" y1="0%" x2="100%" y2="100%" data-v-1bf5a672><stop offset="0%" style="stop-color:var(--color-primary-light);" data-v-1bf5a672></stop><stop offset="100%" style="stop-color:var(--color-primary-dark);" data-v-1bf5a672></stop></linearGradient></defs></svg></div><h1 class="welcome-title gradient-text" data-v-1bf5a672>欢迎使用 The Bot</h1><p class="welcome-subtitle" data-v-1bf5a672>AI 工具箱 - 集成多种 AI 能力的跨平台桌面应用</p></div>', 1)),
          createBaseVNode("div", _hoisted_3, [
            (openBlock(), createElementBlock(Fragment, null, renderList(features, (feature) => {
              return createBaseVNode("div", {
                key: feature.path,
                class: "feature-card",
                onClick: ($event) => navigateTo(feature.path),
                onMouseenter: ($event) => hoveredCard.value = feature.path,
                onMouseleave: _cache[0] || (_cache[0] = ($event) => hoveredCard.value = null)
              }, [
                createBaseVNode("div", {
                  class: normalizeClass(["feature-icon", { hovered: hoveredCard.value === feature.path }])
                }, [
                  (openBlock(), createBlock(resolveDynamicComponent(feature.icon))),
                  _cache[1] || (_cache[1] = createBaseVNode("div", { class: "icon-glow" }, null, -1))
                ], 2),
                createBaseVNode("div", _hoisted_5, [
                  createBaseVNode("h3", _hoisted_6, toDisplayString(feature.title), 1),
                  createBaseVNode("p", _hoisted_7, toDisplayString(feature.description), 1)
                ]),
                createBaseVNode("div", _hoisted_8, [
                  createVNode(_component_el_icon, { size: 20 }, {
                    default: withCtx(() => [
                      createVNode(unref(arrow_right_default))
                    ]),
                    _: 1
                  })
                ])
              ], 40, _hoisted_4);
            }), 64))
          ])
        ]),
        _cache[3] || (_cache[3] = createBaseVNode("div", { class: "home-footer" }, [
          createBaseVNode("div", { class: "footer-info" }, [
            createBaseVNode("span", { class: "version-tag" }, "v0.1.0"),
            createBaseVNode("span", { class: "footer-text" }, [
              createTextVNode("按 "),
              createBaseVNode("kbd", null, "Ctrl"),
              createTextVNode(" + "),
              createBaseVNode("kbd", null, "K"),
              createTextVNode(" 快速打开命令面板")
            ])
          ])
        ], -1))
      ]);
    };
  }
});
const Home = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-1bf5a672"]]);
export {
  Home as default
};
