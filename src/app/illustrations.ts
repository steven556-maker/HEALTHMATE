// رسم توضيحي متحرك لكل تمرين: شخصية بأطراف سميكة (كبسولات) بتوضّح شكل الحركة من وضعين (بداية/نهاية).
// الوضع التاني بيظهر باهت (شبح) ورا الشخصية عشان يبان مداها حتى من غير حركة.
// SMIL من غير أي مكتبة، بيحترم prefers-reduced-motion، ومفيش أي صور بتتحمّل.
const NS = "http://www.w3.org/2000/svg";

type Pt = [number, number];

// مفاصل الشخصية في وضع معيّن. N = القريب من المشاهد، F = البعيد (أفتح شوية عشان يدي عمق)
interface Pose {
  head: Pt;
  neck: Pt; // أعلى الجذع (مكان الكتف)
  hip: Pt; // الحوض
  kneeN: Pt; ankleN: Pt;
  kneeF: Pt; ankleF: Pt;
  elbowN: Pt; wristN: Pt;
  elbowF: Pt; wristF: Pt;
}

interface Figure {
  a: Pose; // وضع البداية
  b: Pose; // وضع الذروة/النهاية
  front?: boolean; // منظر أمامي: الطرفين بنفس الغمقان
  prop?: string; // رسمة ثابتة زيادة (حيطة، كرسي)
  weight?: "dumbbell" | "barbell";
  weightSide?: "near" | "both"; // الافتراضي: في إيد القريبة بس
  dur?: number; // مدة دورة الحركة بالثواني (الافتراضي 2.6)
}

const seg = (...pts: Pt[]): string => `M${pts.map((p) => p.join(" ")).join(" L")}`;
const dot = (p: Pt): string => `M${p.join(" ")} L${p[0] + 0.01} ${p[1]}`;

// أجزاء الجسم بترتيب الرسم (البعيد تحت، القريب فوق)
const bodyParts = (p: Pose, front: boolean): { cls: string; d: string }[] => [
  { cls: front ? "illus-near" : "illus-far", d: seg(p.hip, p.kneeF, p.ankleF) },
  { cls: front ? "illus-arm" : "illus-far", d: seg(p.neck, p.elbowF, p.wristF) },
  { cls: "illus-torso", d: seg(p.neck, p.hip) },
  { cls: "illus-near", d: seg(p.hip, p.kneeN, p.ankleN) },
  { cls: "illus-arm", d: seg(p.neck, p.elbowN, p.wristN) },
  { cls: "illus-hand", d: dot(p.wristN) },
  ...(front ? [{ cls: "illus-hand", d: dot(p.wristF) }] : []),
];

const WEIGHT_PATHS: Record<NonNullable<Figure["weight"]>, string> = {
  dumbbell: "M-7 0H7 M-7 -5V5 M7 -5V5",
  barbell: "M-14 0H14 M-14 -6V6 M14 -6V6",
};

const STAND: Pose = {
  head: [80, 16], neck: [80, 28], hip: [80, 54],
  kneeN: [81, 72], ankleN: [81, 90],
  kneeF: [77, 72], ankleF: [76, 90],
  elbowN: [83, 43], wristN: [85, 58],
  elbowF: [77, 43], wristF: [75, 58],
};
const SQUAT_LOW: Pose = {
  head: [90, 33], neck: [88, 44], hip: [64, 72],
  kneeN: [98, 73], ankleN: [78, 90],
  kneeF: [93, 71], ankleF: [73, 90],
  elbowN: [98, 50], wristN: [117, 46],
  elbowF: [94, 48], wristF: [112, 44],
};
const PLANK_ARMS: Pick<Pose, "elbowN" | "wristN" | "elbowF" | "wristF"> = {
  elbowN: [116, 76], wristN: [116, 89],
  elbowF: [112, 76], wristF: [112, 89],
};

const FIGURES: Record<string, Figure> = {
  squat: { a: STAND, b: SQUAT_LOW },
  pushup: {
    a: {
      head: [130, 60], neck: [117, 64], hip: [70, 72],
      kneeN: [46, 78], ankleN: [24, 85],
      kneeF: [43, 80], ankleF: [21, 87],
      ...PLANK_ARMS,
    },
    b: {
      head: [128, 72], neck: [115, 76], hip: [70, 80],
      kneeN: [47, 83], ankleN: [24, 88],
      kneeF: [44, 85], ankleF: [21, 89],
      elbowN: [103, 86], wristN: [117, 89],
      elbowF: [99, 86], wristF: [113, 89],
    },
  },
  plank: {
    dur: 3.6,
    a: {
      head: [122, 62], neck: [110, 66], hip: [66, 72],
      kneeN: [42, 78], ankleN: [20, 85],
      kneeF: [39, 80], ankleF: [17, 87],
      elbowN: [108, 88], wristN: [124, 88],
      elbowF: [105, 88], wristF: [120, 89],
    },
    b: {
      head: [122, 64], neck: [110, 68], hip: [66, 75],
      kneeN: [42, 80], ankleN: [20, 85],
      kneeF: [39, 82], ankleF: [17, 87],
      elbowN: [108, 88], wristN: [124, 88],
      elbowF: [105, 88], wristF: [120, 89],
    },
  },
  lunge: {
    a: STAND,
    b: {
      head: [78, 25], neck: [78, 36], hip: [76, 64],
      kneeN: [98, 68], ankleN: [98, 90],
      kneeF: [58, 82], ankleF: [40, 89],
      elbowN: [94, 44], wristN: [80, 55],
      elbowF: [68, 44], wristF: [74, 56],
    },
  },
  glute_bridge: {
    a: {
      head: [22, 82], neck: [32, 84], hip: [62, 84],
      kneeN: [88, 62], ankleN: [98, 88],
      kneeF: [84, 64], ankleF: [92, 88],
      elbowN: [42, 86], wristN: [54, 87],
      elbowF: [38, 84], wristF: [50, 85],
    },
    b: {
      head: [22, 82], neck: [33, 82], hip: [64, 60],
      kneeN: [92, 56], ankleN: [100, 88],
      kneeF: [88, 58], ankleF: [94, 88],
      elbowN: [42, 86], wristN: [54, 87],
      elbowF: [38, 84], wristF: [50, 85],
    },
  },
  wall_sit: {
    dur: 3.6,
    prop: "M36 10V90",
    a: {
      head: [46, 21], neck: [44, 32], hip: [44, 60],
      kneeN: [74, 60], ankleN: [74, 90],
      kneeF: [70, 62], ankleF: [68, 90],
      elbowN: [58, 46], wristN: [74, 57],
      elbowF: [54, 44], wristF: [70, 55],
    },
    b: {
      head: [46, 19], neck: [44, 30], hip: [44, 58],
      kneeN: [74, 58], ankleN: [74, 90],
      kneeF: [70, 60], ankleF: [68, 90],
      elbowN: [58, 45], wristN: [74, 55],
      elbowF: [54, 43], wristF: [70, 53],
    },
  },
  sit_to_stand: {
    prop: "M42 40V62H74 M46 62V90 M70 62V90",
    a: {
      head: [56, 23], neck: [56, 34], hip: [58, 62],
      kneeN: [82, 64], ankleN: [82, 90],
      kneeF: [78, 64], ankleF: [78, 90],
      elbowN: [70, 44], wristN: [88, 42],
      elbowF: [66, 42], wristF: [84, 40],
    },
    b: {
      head: [78, 17], neck: [78, 28], hip: [78, 54],
      kneeN: [79, 72], ankleN: [79, 90],
      kneeF: [75, 72], ankleF: [74, 90],
      elbowN: [81, 42], wristN: [83, 58],
      elbowF: [77, 42], wristF: [77, 58],
    },
  },
  high_knees: {
    dur: 1.4,
    a: {
      head: [80, 16], neck: [80, 28], hip: [80, 54],
      kneeN: [102, 56], ankleN: [96, 76],
      kneeF: [76, 72], ankleF: [76, 90],
      elbowN: [66, 38], wristN: [74, 50],
      elbowF: [92, 40], wristF: [80, 30],
    },
    b: {
      head: [80, 16], neck: [80, 28], hip: [80, 54],
      kneeN: [82, 72], ankleN: [82, 90],
      kneeF: [98, 56], ankleF: [92, 76],
      elbowN: [94, 40], wristN: [82, 30],
      elbowF: [68, 38], wristF: [76, 50],
    },
  },
  mountain_climbers: {
    dur: 1.4,
    a: {
      head: [128, 58], neck: [116, 63], hip: [72, 70],
      kneeN: [98, 78], ankleN: [88, 89],
      kneeF: [44, 76], ankleF: [22, 84],
      ...PLANK_ARMS,
      elbowN: [114, 77], wristN: [114, 90],
      elbowF: [110, 77], wristF: [110, 90],
    },
    b: {
      head: [128, 58], neck: [116, 63], hip: [72, 70],
      kneeN: [46, 78], ankleN: [24, 86],
      kneeF: [96, 78], ankleF: [86, 89],
      elbowN: [114, 77], wristN: [114, 90],
      elbowF: [110, 77], wristF: [110, 90],
    },
  },
  leg_raise: {
    dur: 2.8,
    a: {
      head: [20, 80], neck: [30, 82], hip: [56, 82],
      kneeN: [90, 84], ankleN: [124, 84],
      kneeF: [88, 86], ankleF: [122, 87],
      elbowN: [40, 84], wristN: [52, 85],
      elbowF: [36, 82], wristF: [48, 83],
    },
    b: {
      head: [20, 80], neck: [30, 82], hip: [56, 82],
      kneeN: [60, 44], ankleN: [62, 12],
      kneeF: [56, 45], ankleF: [57, 14],
      elbowN: [40, 84], wristN: [52, 85],
      elbowF: [36, 82], wristF: [48, 83],
    },
  },
  goblet_squat: {
    weight: "dumbbell",
    a: { ...STAND, elbowN: [88, 44], wristN: [98, 41], elbowF: [84, 42], wristF: [94, 39] },
    b: { ...SQUAT_LOW, elbowN: [88, 54], wristN: [99, 47], elbowF: [84, 52], wristF: [95, 45] },
  },
  biceps_curl: {
    weight: "dumbbell", weightSide: "both",
    a: { ...STAND, elbowN: [86, 44], wristN: [97, 60], elbowF: [80, 44], wristF: [89, 62] },
    b: { ...STAND, elbowN: [86, 44], wristN: [104, 38], elbowF: [80, 44], wristF: [97, 36] },
  },
  shoulder_press: {
    weight: "dumbbell",
    a: { ...STAND, elbowN: [92, 44], wristN: [92, 30], elbowF: [78, 45], wristF: [78, 32] },
    b: { ...STAND, elbowN: [93, 20], wristN: [95, 6], elbowF: [80, 22], wristF: [81, 8] },
  },
  lateral_raise: {
    front: true, weight: "dumbbell", weightSide: "both",
    a: {
      head: [80, 14], neck: [80, 26], hip: [80, 54],
      kneeN: [72, 72], ankleN: [70, 90],
      kneeF: [88, 72], ankleF: [90, 90],
      elbowN: [68, 40], wristN: [64, 58],
      elbowF: [92, 40], wristF: [96, 58],
    },
    b: {
      head: [80, 14], neck: [80, 26], hip: [80, 54],
      kneeN: [72, 72], ankleN: [70, 90],
      kneeF: [88, 72], ankleF: [90, 90],
      elbowN: [56, 33], wristN: [36, 31],
      elbowF: [104, 33], wristF: [124, 31],
    },
  },
  romanian_deadlift: {
    weight: "barbell",
    a: { ...STAND, elbowN: [83, 46], wristN: [82, 62], elbowF: [78, 46], wristF: [77, 62] },
    b: {
      head: [122, 40], neck: [110, 45], hip: [76, 56],
      kneeN: [82, 74], ankleN: [80, 90],
      kneeF: [77, 74], ankleF: [75, 90],
      elbowN: [102, 62], wristN: [95, 79],
      elbowF: [97, 62], wristF: [90, 79],
    },
  },
};

export function renderIllustration(exerciseId: string, label: string, animate = true): SVGSVGElement | null {
  const fig = FIGURES[exerciseId];
  if (!fig) return null;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const moving = animate && !reduce;
  const front = fig.front ?? false;
  const dur = `${fig.dur ?? 2.6}s`;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 160 100");
  svg.setAttribute("class", "exercise-illustration");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("dir", "ltr");

  const el = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string): SVGElementTagNameMap[K] => {
    const node = document.createElementNS(NS, tag);
    node.setAttribute("class", cls);
    return node;
  };
  const anim = (attr: string, values: string): SVGAnimateElement => {
    const a = document.createElementNS(NS, "animate");
    a.setAttribute("attributeName", attr);
    a.setAttribute("values", values);
    a.setAttribute("dur", dur);
    a.setAttribute("repeatCount", "indefinite");
    a.setAttribute("calcMode", "spline");
    a.setAttribute("keyTimes", "0;0.5;1");
    a.setAttribute("keySplines", ".4 0 .2 1;.4 0 .2 1");
    return a;
  };

  const partsA = bodyParts(fig.a, front);
  const partsB = bodyParts(fig.b, front);

  const halo = el("circle", "illus-halo");
  halo.setAttribute("cx", "80"); halo.setAttribute("cy", "48"); halo.setAttribute("r", "40");
  const floor = el("path", "illus-floor");
  floor.setAttribute("d", "M6 90H154");
  svg.append(halo, floor);

  if (fig.prop) {
    const prop = el("path", "illus-prop");
    prop.setAttribute("d", fig.prop);
    svg.append(prop);
  }

  // شبح وضع الذروة: بيبيّن مدى الحركة حتى في الشكل الثابت
  const ghost = el("path", "illus-ghost");
  ghost.setAttribute("d", partsB.map((p) => p.d).join(" "));
  const ghostHead = el("circle", "illus-ghost-head");
  ghostHead.setAttribute("r", "8.5");
  ghostHead.setAttribute("cx", String(fig.b.head[0]));
  ghostHead.setAttribute("cy", String(fig.b.head[1]));
  svg.append(ghost, ghostHead);

  // الجسم المتحرك من وضع البداية للذروة ورجوع
  partsA.forEach((part, i) => {
    const path = el("path", part.cls);
    path.setAttribute("d", part.d);
    if (moving) path.append(anim("d", `${part.d};${partsB[i].d};${part.d}`));
    svg.append(path);
  });

  const head = el("circle", "illus-head");
  head.setAttribute("r", "8.5");
  head.setAttribute("cx", String(fig.a.head[0]));
  head.setAttribute("cy", String(fig.a.head[1]));
  if (moving) {
    head.append(
      anim("cx", `${fig.a.head[0]};${fig.b.head[0]};${fig.a.head[0]}`),
      anim("cy", `${fig.a.head[1]};${fig.b.head[1]};${fig.a.head[1]}`),
    );
  }
  svg.append(head);

  if (fig.weight) {
    const sides: Pt[] = fig.weightSide === "both" ? [fig.a.wristN, fig.a.wristF] : [fig.a.wristN];
    const sidesB: Pt[] = fig.weightSide === "both" ? [fig.b.wristN, fig.b.wristF] : [fig.b.wristN];
    sides.forEach((wrist, i) => {
      const g = el("g", "illus-weight");
      g.setAttribute("transform", `translate(${wrist[0]} ${wrist[1]})`);
      const shape = document.createElementNS(NS, "path");
      shape.setAttribute("d", WEIGHT_PATHS[fig.weight!]);
      g.append(shape);
      if (moving) {
        const t = document.createElementNS(NS, "animateTransform");
        t.setAttribute("attributeName", "transform");
        t.setAttribute("type", "translate");
        t.setAttribute("values", `${wrist[0]} ${wrist[1]};${sidesB[i][0]} ${sidesB[i][1]};${wrist[0]} ${wrist[1]}`);
        t.setAttribute("dur", dur);
        t.setAttribute("repeatCount", "indefinite");
        t.setAttribute("calcMode", "spline");
        t.setAttribute("keyTimes", "0;0.5;1");
        t.setAttribute("keySplines", ".4 0 .2 1;.4 0 .2 1");
        g.append(t);
      }
      svg.append(g);
    });
  }

  return svg;
}
