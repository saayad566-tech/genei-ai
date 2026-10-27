import { describe, expect, it } from "vitest";
import { checkContinuity, summarise, type ContinuityProject, type SceneRecord } from "./continuity";

/**
 * Continuity engine.
 *
 * One test per issue code, because each code is a distinct way a film breaks and a check
 * that silently stops firing is worse than no check — the project would believe it is clean.
 */

const base = (): ContinuityProject => ({
  characters: [
    { id: "aria", name: "Aria", wardrobe: ["coat", "boots"] },
    { id: "kael", name: "Kael", wardrobe: ["jacket"] },
  ],
  locations: [
    { id: "outpost", name: "Outpost" },
    { id: "underbelly", name: "Underbelly" },
  ],
  props: [
    { id: "envelope", name: "Envelope", introducedInSceneId: "s2" },
    { id: "locket", name: "Locket" },
  ],
  scenes: [],
});

const scene = (over: Partial<SceneRecord> & { id: string; index: number }): SceneRecord => ({
  time: { label: `t${over.index}`, order: over.index },
  locationId: "outpost",
  characters: [],
  props: [],
  ...over,
});

const codes = (project: ContinuityProject) => checkContinuity(project).issues.map((i) => i.code);

describe("cast and world integrity", () => {
  it("flags a character who is not in the cast", () => {
    const p = base();
    p.scenes = [scene({ id: "s1", index: 1, characters: [{ characterId: "ghost", wardrobe: [] }] })];
    expect(codes(p)).toContain("UNKNOWN_CHARACTER");
  });

  it("flags a location that is not in the project", () => {
    const p = base();
    p.scenes = [scene({ id: "s1", index: 1, locationId: "moon" })];
    expect(codes(p)).toContain("UNKNOWN_LOCATION");
  });

  it("flags a prop that is not in the project", () => {
    const p = base();
    p.scenes = [scene({ id: "s1", index: 1, props: ["sword"] })];
    expect(codes(p)).toContain("UNKNOWN_PROP");
  });

  it("flags duplicate scene indices, because adjacency becomes meaningless", () => {
    const p = base();
    p.scenes = [scene({ id: "s1", index: 1 }), scene({ id: "s2", index: 1 })];
    expect(codes(p)).toContain("DUPLICATE_SCENE_INDEX");
  });
});

describe("props", () => {
  it("flags a prop used before its introduction", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, props: ["envelope"] }), // introduced in s2, used in s1
      scene({ id: "s2", index: 2, props: ["envelope"] }),
    ];
    expect(codes(p)).toContain("PROP_BEFORE_INTRODUCTION");
  });

  it("allows a prop at or after its introduction", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1 }),
      scene({ id: "s2", index: 2, props: ["envelope"] }),
      scene({ id: "s3", index: 3, props: ["envelope"] }),
    ];
    expect(codes(p)).not.toContain("PROP_BEFORE_INTRODUCTION");
  });

  it("flags one prop held by two characters at once", () => {
    const p = base();
    p.scenes = [
      scene({
        id: "s1",
        index: 1,
        characters: [
          { characterId: "aria", wardrobe: ["coat", "boots"], holds: ["locket"] },
          { characterId: "kael", wardrobe: ["jacket"], holds: ["locket"] },
        ],
      }),
    ];
    expect(codes(p)).toContain("PROP_IN_TWO_PLACES");
  });
});

describe("wardrobe", () => {
  it("flags an unexplained wardrobe change", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }] }),
      scene({ id: "s2", index: 2, characters: [{ characterId: "aria", wardrobe: ["dress"] }] }),
    ];
    expect(codes(p)).toContain("WARDROBE_CHANGED_WITHOUT_REASON");
  });

  it("accepts a wardrobe change the scene explains", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }] }),
      scene({
        id: "s2",
        index: 2,
        characters: [{ characterId: "aria", wardrobe: ["dress"] }],
        changeReason: "She changes for the gala.",
      }),
    ];
    expect(codes(p)).not.toContain("WARDROBE_CHANGED_WITHOUT_REASON");
  });

  it("does not flag the same wardrobe twice", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }] }),
      scene({ id: "s2", index: 2, characters: [{ characterId: "aria", wardrobe: ["boots", "coat"] }] }),
    ];
    // Order must not matter.
    expect(codes(p)).not.toContain("WARDROBE_CHANGED_WITHOUT_REASON");
  });
});

describe("time and space", () => {
  it("flags a time regression between adjacent scenes", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, time: { label: "day 2", order: 20 } }),
      scene({ id: "s2", index: 2, time: { label: "day 1", order: 10 } }),
    ];
    expect(codes(p)).toContain("TIME_REGRESSION");
  });

  it("flags a location jump with no transition", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, locationId: "outpost" }),
      scene({ id: "s2", index: 2, locationId: "underbelly" }),
    ];
    expect(codes(p)).toContain("TELEPORT");
  });

  it("accepts a location change the scene explains", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, locationId: "outpost" }),
      scene({ id: "s2", index: 2, locationId: "underbelly", changeReason: "Cut to the chase." }),
    ];
    expect(codes(p)).not.toContain("TELEPORT");
  });

  it("flags a screen-direction flip", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, screenDirection: "left-to-right" }),
      scene({ id: "s2", index: 2, screenDirection: "right-to-left" }),
    ];
    expect(codes(p)).toContain("SCREEN_DIRECTION_FLIP");
  });
});

describe("narrative knowledge", () => {
  it("notes a character told the same fact twice", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"], learns: ["the code"] }] }),
      scene({ id: "s2", index: 2, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"], learns: ["the code"] }] }),
    ];
    expect(codes(p)).toContain("KNOWS_SOMETHING_UNTAUGHT");
  });

  it("does not note a fact learned once", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"], learns: ["the code"] }] }),
      scene({ id: "s2", index: 2, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"], learns: ["the key"] }] }),
    ];
    expect(codes(p)).not.toContain("KNOWS_SOMETHING_UNTAUGHT");
  });

  it("notes a character who vanishes from a same-location scene and returns", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, locationId: "outpost", characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }] }),
      scene({ id: "s2", index: 2, locationId: "outpost", characters: [{ characterId: "kael", wardrobe: ["jacket"] }] }),
      scene({ id: "s3", index: 3, locationId: "outpost", characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }] }),
    ];
    expect(codes(p)).toContain("CHARACTER_VANISHES_AND_RETURNS");
  });
});

describe("report shape and honesty", () => {
  it("counts by severity and totals correctly", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, characters: [{ characterId: "ghost", wardrobe: [] }] }),
      scene({ id: "s2", index: 2, locationId: "moon" }),
    ];
    const report = checkContinuity(p);
    expect(report.counts.error).toBe(2);
    expect(report.issues.length).toBe(report.counts.error + report.counts.warning + report.counts.note);
    expect(report.scenesChecked).toBe(2);
  });

  it("gives every issue a reference and an action — never a bare verdict", () => {
    const p = base();
    p.scenes = [scene({ id: "s1", index: 1, characters: [{ characterId: "ghost", wardrobe: [] }], props: ["sword"] })];
    for (const issue of checkContinuity(p).issues) {
      expect(issue.reference.length).toBeGreaterThan(0);
      expect(issue.action.length).toBeGreaterThan(0);
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  it("states its own coverage instead of implying a clean report means correct", () => {
    const report = checkContinuity(base());
    expect(report.coverage).toMatch(/cannot be checked/i);
    expect(report.coverage).toMatch(/not that the film is correct/i);
  });

  it("reports zero issues for a genuinely consistent project", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, locationId: "outpost", time: { label: "d1", order: 1 }, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"], firstAppearance: true }] }),
      scene({ id: "s2", index: 2, locationId: "outpost", time: { label: "d1 later", order: 2 }, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }], props: ["envelope"] }),
    ];
    const report = checkContinuity(p);
    expect(report.issues).toEqual([]);
    expect(summarise(report)).toMatch(/No recorded contradictions/i);
  });

  it("is pure — the same project checked twice gives the same result", () => {
    const p = base();
    p.scenes = [
      scene({ id: "s1", index: 1, characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }] }),
      scene({ id: "s2", index: 2, characters: [{ characterId: "aria", wardrobe: ["dress"] }] }),
    ];
    const first = checkContinuity(p).issues.length;
    const second = checkContinuity(p).issues.length;
    expect(first).toBe(second);
  });

  it("handles an empty project without throwing", () => {
    expect(() => checkContinuity({ characters: [], locations: [], props: [], scenes: [] })).not.toThrow();
  });

  it("summarises counts in one line", () => {
    const p = base();
    p.scenes = [scene({ id: "s1", index: 1, locationId: "moon" })];
    expect(summarise(checkContinuity(p))).toMatch(/error/i);
  });
});
