import { describe, expect, it } from "vitest";
import {
  getRoleSpaceWorkplaceDensity,
  getSharedFacilityWorkplaceDensity,
  isLoungeFurnitureAllowed,
} from "./officeWorkplaceDensity";

describe("office workplace density model", () => {
  it("keeps work, meeting, ops, study, and memory zones office-first instead of lounge-first", () => {
    expect(getRoleSpaceWorkplaceDensity("work-bay").props).toEqual(
      expect.arrayContaining(["desk", "monitor", "chair", "partition", "ticketTray"]),
    );
    expect(getRoleSpaceWorkplaceDensity("meeting-room").props).toEqual(
      expect.arrayContaining(["desk", "chair", "whiteboard", "partition"]),
    );
    expect(getRoleSpaceWorkplaceDensity("ops-corner").props).toEqual(
      expect.arrayContaining(["nocWall", "serverRack", "projectBoard", "monitor"]),
    );
    expect(getRoleSpaceWorkplaceDensity("study-room").props).toEqual(
      expect.arrayContaining(["desk", "monitor", "whiteboard", "archiveCabinet"]),
    );
    expect(getSharedFacilityWorkplaceDensity("project-board").loungeAllowed).toBe(false);
    expect(isLoungeFurnitureAllowed("break")).toBe(true);
    expect(isLoungeFurnitureAllowed("project-board")).toBe(false);
    expect(isLoungeFurnitureAllowed("roof-lounge")).toBe(false);
  });
});
