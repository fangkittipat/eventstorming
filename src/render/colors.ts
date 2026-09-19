export const colors = {
  paper: "#ffffff",
  ink: "#1c1c1c",
  muted: "#6b6b6b",
  actor: { fill: "#fff176", stroke: "#e6d85c", text: "#1c1c1c" },
  aggregate: { fill: "#fff9c4", stroke: "#efe08a", text: "#1c1c1c" },
  command: { fill: "#7ecbff", stroke: "#5eb6f0", text: "#1c1c1c" },
  event: { fill: "#ffb04a", stroke: "#f09a32", text: "#1c1c1c" },
  read: { fill: "#c5e063", stroke: "#b3d14f", text: "#1c1c1c" },
  system: { fill: "#f8bbd0", stroke: "#f09bb8", text: "#1c1c1c" },
  policy: { fill: "#e0b0f0", stroke: "#d19ae4", text: "#1c1c1c" },
  hotspot: { fill: "#f08080", stroke: "#e06e6e", text: "#1c1c1c" },
  none: { fill: "#ececec", stroke: "#d8d8d8", text: "#6e6e6e" },
  valuePlus: { fill: "#c5e063", stroke: "#b3d14f", text: "#1c1c1c" },
  valueMinus: { fill: "#f08080", stroke: "#e06e6e", text: "#1c1c1c" },
} as const;

export const layout = {
  margin: 40,
  header: 128,
  gap: 36,
  fanGap: 72,
  branchGap: 28,
  pathGap: 56,
  labelH: 26,
  minWidth: 960,
} as const;
