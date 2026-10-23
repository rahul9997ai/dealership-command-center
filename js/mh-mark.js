"use strict";
/* Mahan-EX mark: a chrome hexagon holding a neon M and H that share a stem (the M in cyan, the H in amber, joined by a
   glowing node on the crossbar). One source for the landing page, the side menu and the icon files (see
   tools/build-icons.js). mhMark({ traces, icon, label }): traces = circuit lines running out of the hexagon (landing
   page); icon = on a midnight rounded square (favicon / app icon). Each call gets its own gradient ids. */
var MH_N = 0;
function mhMark(o){
  o = o || {};
  var id = "mh" + (++MH_N), cy = "#52e4ff", am = "#ffb324";
  function tube(d, c, core){ var w = o.icon ? 6.6 : 4.6, g = o.icon ? 15 : 12;
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-opacity=".22" stroke-width="' + g + '" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + core + '" stroke-opacity=".9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function node(x, y, c, r){ r = r || 4.4; return '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 3) + '" fill="' + c + '" fill-opacity=".28"/><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '"/><circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.5) + '" fill="#fff"/>'; }
  var traces = "";
  if (o.traces){
    var t = ["M24 72H4L-10 58H-26", "M24 128H4L-10 142H-26", "M176 72H196L210 58H226", "M176 128H196L210 142H226", "M100 12V-4"], dots = [[-26,58],[-26,142],[226,58],[226,142],[100,-4]];
    traces = '<g fill="none" stroke="#3fd0e8" stroke-opacity=".75" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + t.map(function(d){ return '<path d="' + d + '"/>'; }).join("") + '</g>' +
      dots.map(function(p){ return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.8" fill="#52e4ff"/>'; }).join("");
  }
  var hex = '<polygon points="100,10 178,55 178,145 100,190 22,145 22,55" fill="url(#' + id + 'f)" stroke="url(#' + id + 'f)" stroke-width="5" stroke-linejoin="round"/>' +
    '<polygon points="100,22 168,61 168,139 100,178 32,139 32,61" fill="url(#' + id + 'r)" stroke="#040b17" stroke-opacity=".6" stroke-width="1.6"/>' +
    '<polyline points="32,139 32,61 100,22" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.2" stroke-linejoin="round"/>' +
    tube("M52 138V64L76 104L100 64V138", cy, "#e9fcff") + tube("M148 64V138M100 104H148", am, "#fff6dc") +
    [[52,64],[52,138],[100,64],[100,138],[76,104]].map(function(p){ return node(p[0], p[1], cy, 3.6); }).join("") +
    [[148,64],[148,138]].map(function(p){ return node(p[0], p[1], am, 3.6); }).join("") + node(124, 104, am, 4.6);
  var defs = '<defs><linearGradient id="' + id + 'f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f9ff"/><stop offset=".38" stop-color="#a8b9d8"/><stop offset=".62" stop-color="#5d7198"/><stop offset="1" stop-color="#2a3a5e"/></linearGradient>' +
    '<radialGradient id="' + id + 'r" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#18376a"/><stop offset="1" stop-color="#071326"/></radialGradient></defs>';
  var label = o.label === undefined ? "Mahan-EX" : o.label, a = label ? 'role="img" aria-label="' + label + '"' : 'aria-hidden="true"';
  if (o.icon) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" ' + a + '>' + defs + '<rect width="200" height="200" rx="44" fill="#0b1430"/>' + hex + '</svg>';
  var vb = o.traces ? "-30 -14 260 214" : "0 0 200 200";
  return '<svg xmlns="http://www.w3.org/2000/svg" class="mh-mark" viewBox="' + vb + '" ' + a + '>' + defs + traces + hex + '</svg>';
}
