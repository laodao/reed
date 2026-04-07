import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-OYMX7WX6-DHbtoMhc.js";
import { _ as __name } from "./Chat-S6e41Fi0.js";
import "./Serializer-BBsy6wRx.js";
import "./chunk-55IACEB6-S5ZjUOuv.js";
import "./chunk-EDXVE4YY-CKDT9QLO.js";
import "./index-CEiunyEa.js";
import "./marked.esm-zOC1-fXp.js";
import "./line-CnyHbvL_.js";
import "./array-DgktLKBx.js";
import "./path-Cp2qmpkd.js";
var diagram = {
  parser: stateDiagram_default,
  get db() {
    return new StateDB(2);
  },
  renderer: stateRenderer_v3_unified_default,
  styles: styles_default,
  init: /* @__PURE__ */ __name((cnf) => {
    if (!cnf.state) {
      cnf.state = {};
    }
    cnf.state.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
  }, "init")
};
export {
  diagram
};
