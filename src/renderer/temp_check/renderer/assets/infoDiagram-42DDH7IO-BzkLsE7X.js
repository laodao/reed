import { _ as __name, l as log, F as selectSvgElement, d as configureSvgSize } from "./Chat-S6e41Fi0.js";
import { p as parse } from "./wardley-RL74JXVD-Dt--PQ13.js";
import "./index-CEiunyEa.js";
import "./marked.esm-zOC1-fXp.js";
import "./Serializer-BBsy6wRx.js";
import "./line-CnyHbvL_.js";
import "./array-DgktLKBx.js";
import "./path-Cp2qmpkd.js";
import "./reduce-DTIDu9nM.js";
import "./min-j-9kvY-u.js";
var parser = {
  parse: /* @__PURE__ */ __name(async (input) => {
    const ast = await parse("info", input);
    log.debug(ast);
  }, "parse")
};
var DEFAULT_INFO_DB = {
  version: "11.14.0"
};
var getVersion = /* @__PURE__ */ __name(() => DEFAULT_INFO_DB.version, "getVersion");
var db = {
  getVersion
};
var draw = /* @__PURE__ */ __name((text, id, version) => {
  log.debug("rendering info diagram\n" + text);
  const svg = selectSvgElement(id);
  configureSvgSize(svg, 100, 400, true);
  const group = svg.append("g");
  group.append("text").attr("x", 100).attr("y", 40).attr("class", "version").attr("font-size", 32).style("text-anchor", "middle").text(`v${version}`);
}, "draw");
var renderer = { draw };
var diagram = {
  parser,
  db,
  renderer
};
export {
  diagram
};
