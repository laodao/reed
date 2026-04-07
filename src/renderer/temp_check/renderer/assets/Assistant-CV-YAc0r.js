import { d as defineComponent, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, e as createTextVNode, f as resolveComponent, o as openBlock, _ as _export_sfc } from "./index-CEiunyEa.js";
const _hoisted_1 = { class: "assistant-page" };
const _hoisted_2 = { class: "assistant-container" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Assistant",
  setup(__props) {
    return (_ctx, _cache) => {
      const _component_el_button = resolveComponent("el-button");
      const _component_el_empty = resolveComponent("el-empty");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        _cache[1] || (_cache[1] = createBaseVNode("div", { class: "page-header" }, [
          createBaseVNode("h2", null, "智能助手"),
          createBaseVNode("p", null, "自动化任务与智能推荐")
        ], -1)),
        createBaseVNode("div", _hoisted_2, [
          createVNode(_component_el_empty, { description: "智能助手功能开发中..." }, {
            default: withCtx(() => [
              createVNode(_component_el_button, { type: "primary" }, {
                default: withCtx(() => [..._cache[0] || (_cache[0] = [
                  createTextVNode("创建任务", -1)
                ])]),
                _: 1
              })
            ]),
            _: 1
          })
        ])
      ]);
    };
  }
});
const Assistant = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-d4f4deba"]]);
export {
  Assistant as default
};
