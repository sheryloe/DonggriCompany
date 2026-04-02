export type RolePackSeed = {
  id: string;
  slug: string;
  title: string;
  description: string;
  rootDir: string;
  manifestJson: Record<string, unknown>;
  isEnabled: 0 | 1;
};

export type EmployeeSeed = {
  id: string;
  name: string;
  rolePackId: string;
  avatarType: string;
  avatarAsset: string;
  visualPreset: string;
  status: string;
};

export type Step1SeedData = {
  rolePacks: RolePackSeed[];
  employees: EmployeeSeed[];
};

export const STEP1_SEED_DATA: Step1SeedData = {
  rolePacks: [
    {
      id: "rp_planner_basic",
      slug: "planner-basic",
      title: "Planner Basic",
      description: "General planning and task breakdown role pack.",
      rootDir: "rolepacks/planner-basic",
      manifestJson: {
        category: "planner",
        version: "0.1.0"
      },
      isEnabled: 1
    },
    {
      id: "rp_researcher_basic",
      slug: "researcher-basic",
      title: "Researcher Basic",
      description: "Research and synthesis starter role pack.",
      rootDir: "rolepacks/researcher-basic",
      manifestJson: {
        category: "researcher",
        version: "0.1.0"
      },
      isEnabled: 1
    }
  ],
  employees: [
    {
      id: "emp_seed_pm_cat",
      name: "PM Cat",
      rolePackId: "rp_planner_basic",
      avatarType: "animal",
      avatarAsset: "cat_pm",
      visualPreset: "pixel-soft",
      status: "idle"
    },
    {
      id: "emp_seed_research_fox",
      name: "Research Fox",
      rolePackId: "rp_researcher_basic",
      avatarType: "animal",
      avatarAsset: "fox_research",
      visualPreset: "pixel-soft",
      status: "idle"
    }
  ]
};
