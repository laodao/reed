import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-4TB4RGXK-BVJVzgZ-.js";
import { _ as __name } from "./Chat-S6e41Fi0.js";
import "./Serializer-BBsy6wRx.js";
import "./chunk-FMBD7UC4-CdnLznAr.js";
import "./chunk-YZCP3GAM-C-pJHN3c.js";
import "./chunk-55IACEB6-S5ZjUOuv.js";
import "./chunk-EDXVE4YY-CKDT9QLO.js";
import "./index-CEiunyEa.js";
import "./marked.esm-zOC1-fXp.js";
import "./line-CnyHbvL_.js";
import "./array-DgktLKBx.js";
import "./path-Cp2qmpkd.js";
var diagram = {
  parser: classDiagram_default,
  get db() {
    return new ClassDB();
  },
  renderer: classRenderer_v3_unified_default,
  styles: styles_default,
  init: /* @__PURE__ */ __name((cnf) => {
    if (!cnf.class) {
      cnf.class = {};
    }
    cnf.class.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
  }, "init")
};
export {
  diagram
};
