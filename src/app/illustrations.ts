// رسم توضيحي متحرك (شخص بخطوط بسيطة) لكل تمرين قبل ما يبدأ. SMIL من غير أي مكتبة، وبيتوقف لو المستخدم مفضّل تقليل الحركة.
const NS = "http://www.w3.org/2000/svg";

interface Pose { head: [number, number]; sh: [number, number]; hip: [number, number]; k1: [number, number]; a1: [number, number]; k2: [number, number]; a2: [number, number]; el: [number, number]; wr: [number, number] }
const P = (head: [number, number], sh: [number, number], hip: [number, number], k1: [number, number], a1: [number, number], el: [number, number], wr: [number, number], k2 = k1, a2 = a1): Pose => ({ head, sh, hip, k1, a1, k2, a2, el, wr });

const pathOf = (p: Pose) => `M${p.sh} L${p.hip} L${p.k1} L${p.a1} M${p.hip} L${p.k2} L${p.a2} M${p.sh} L${p.el} L${p.wr}`;

const STAND = P([80, 18], [80, 28], [80, 52], [80, 70], [80, 88], [88, 38], [96, 32]);
const FIGURES: Record<string, { a: Pose; b: Pose; extra?: string }> = {
  squat: { a: STAND, b: P([79, 36], [76, 46], [66, 70], [94, 70], [78, 88], [86, 50], [98, 50]) },
  pushup: { a: P([126, 42], [115, 50], [70, 67], [47, 75], [25, 84], [116, 68], [118, 86]), b: P([126, 70], [112, 76], [68, 78], [46, 82], [25, 84], [100, 80], [118, 86]) },
  plank: { a: P([126, 70], [112, 74], [70, 78], [48, 82], [25, 85], [112, 86], [130, 86]), b: P([126, 68], [112, 72], [70, 74], [48, 80], [25, 85], [112, 86], [130, 86]) },
  lunge: { a: STAND, b: P([80, 28], [80, 40], [80, 66], [100, 66], [100, 88], [88, 50], [96, 46], [66, 80], [52, 88]) },
  glute_bridge: { a: P([18, 86], [30, 86], [62, 84], [92, 58], [100, 86], [40, 86], [52, 86]), b: P([18, 86], [30, 86], [62, 66], [96, 50], [100, 86], [40, 86], [52, 86]) },
  wall_sit: { a: P([46, 20], [46, 30], [46, 62], [80, 62], [80, 88], [60, 44], [76, 50]), b: P([46, 20], [46, 30], [46, 62], [80, 62], [80, 88], [60, 44], [76, 50]), extra: "M40 8V90" },
  sit_to_stand: { a: P([68, 28], [68, 38], [70, 64], [96, 64], [96, 88], [78, 46], [92, 46]), b: P([80, 18], [80, 28], [80, 52], [80, 70], [80, 88], [88, 38], [96, 32]), extra: "M52 38V68H84M56 68V88M82 68V88" },
};

export function renderIllustration(exerciseId: string, label: string, animate = true): SVGSVGElement | null {
  const fig = FIGURES[exerciseId];
  if (!fig) return null;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 160 100"); svg.setAttribute("class", "exercise-illustration"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label);
  svg.setAttribute("dir", "ltr");
  const floor = document.createElementNS(NS, "path"); floor.setAttribute("d", "M4 91H156"); floor.setAttribute("class", "illus-floor"); svg.append(floor);
  if (fig.extra) { const extra = document.createElementNS(NS, "path"); extra.setAttribute("d", fig.extra); extra.setAttribute("class", "illus-prop"); svg.append(extra); }
  const body = document.createElementNS(NS, "path"); body.setAttribute("d", pathOf(fig.a)); body.setAttribute("class", "illus-body");
  const head = document.createElementNS(NS, "circle"); head.setAttribute("r", "7"); head.setAttribute("cx", String(fig.a.head[0])); head.setAttribute("cy", String(fig.a.head[1])); head.setAttribute("class", "illus-head");
  if (animate && !reduce) {
    const anim = (attr: string, values: string) => { const a = document.createElementNS(NS, "animate"); a.setAttribute("attributeName", attr); a.setAttribute("values", values); a.setAttribute("dur", "3s"); a.setAttribute("repeatCount", "indefinite"); a.setAttribute("calcMode", "spline"); a.setAttribute("keyTimes", "0;0.5;1"); a.setAttribute("keySplines", ".4 0 .2 1;.4 0 .2 1"); return a; };
    body.append(anim("d", `${pathOf(fig.a)};${pathOf(fig.b)};${pathOf(fig.a)}`));
    head.append(anim("cx", `${fig.a.head[0]};${fig.b.head[0]};${fig.a.head[0]}`), anim("cy", `${fig.a.head[1]};${fig.b.head[1]};${fig.a.head[1]}`));
  }
  svg.append(body, head);
  return svg;
}
