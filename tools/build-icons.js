/* Writes icons/mh.svg (app icon), icons/mh-mark.svg and icons/mh-lockup.svg from js/mh-mark.js. Run: node tools/build-icons.js
   The PNG sizes (32, 180, 192, 512) are then rendered from icons/mh.svg with headless Edge/Chrome. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/mh-mark.js"), "utf8") + ";this.mhMark=mhMark;", ctx);
const out = (f, s) => fs.writeFileSync(path.join(__dirname, "../icons", f), s);
out("mh.svg", ctx.mhMark({ icon: true }));
out("mh-mark.svg", ctx.mhMark({}));
out("mh-lockup.svg", ctx.mhMark({ traces: true }));
console.log("ok");
