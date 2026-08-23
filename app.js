import p1 from "./app-part1.js";
import p2 from "./app-part2.js";
import p3 from "./app-part3.js";
const compressed = p1 + p2 + p3;
const bytes = Uint8Array.from(atob(compressed), c => c.charCodeAt(0));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
const source = await new Response(stream).text();
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
try { await import(url); } finally { URL.revokeObjectURL(url); }
