import { f as flowDb, p as parser$1 } from "./flowDb-c6c81e3f-CsTcva5O.js";
import { f as flowStyles, a as flowRendererV2 } from "./styles-d45a18b0-D4mbtUUx.js";
import { x as setConfig } from "./mermaid.core-BgzRvROR.js";
import "./Serializer-BBsy6wRx.js";
import "./graph-CUfEw_t4.js";
import "./layout-BLt23WNu.js";
import "./index-CEiunyEa.js";
import "./index-5325376f-DjUc7Tqf.js";
import "./edges-96097737-CR7EJyOl.js";
import "./createText-1719965b-DV6n8QeS.js";
import "./MarkdownEditor.vue_vue_type_style_index_0_lang-Dkwf67xc.js";
import "./line-CnyHbvL_.js";
import "./array-DgktLKBx.js";
import "./path-Cp2qmpkd.js";
import "./channel-Desg71nf.js";
import "./reduce-DTIDu9nM.js";
import "./min-j-9kvY-u.js";
import "./zipObject-1Osu8_xv.js";
const diagram = {
  parser: parser$1,
  db: flowDb,
  renderer: flowRendererV2,
  styles: flowStyles,
  init: (cnf) => {
    if (!cnf.flowchart) {
      cnf.flowchart = {};
    }
    cnf.flowchart.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
    setConfig({ flowchart: { arrowMarkerAbsolute: cnf.arrowMarkerAbsolute } });
    flowRendererV2.setConf(cnf.flowchart);
    flowDb.clear();
    flowDb.setGen("gen-2");
  }
};
export {
  diagram
};
