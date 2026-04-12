import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProjectEditorPanel from "./ProjectEditorPanel";

vi.mock("./ManualAssignmentSelector", () => ({
  default: () => <div data-testid="manual-assignment-selector" />,
}));

describe("ProjectEditorPanel GitHub automation UI", () => {
  it("shows repository options when GitHub auto-create is enabled", () => {
    render(
      <ProjectEditorPanel
        t={(messages) => messages.en}
        language="en"
        isCreating
        editingProjectId={null}
        selectedProject={null}
        detail={null}
        name="Platform"
        setName={vi.fn()}
        githubAutoCreateAvailable
        githubAutoCreateEnabled
        setGitHubAutoCreateEnabled={vi.fn()}
        githubRepoName="platform"
        setGitHubRepoName={vi.fn()}
        githubRepoPrivate
        setGitHubRepoPrivate={vi.fn()}
        defaultProjectRoot="D:\\Projects"
        defaultProjectRootLoading={false}
        projectPath="D:\\Projects\\platform"
        setProjectPath={vi.fn()}
        projectPathCustomized={false}
        setProjectPathCustomized={vi.fn()}
        onResetAutoProjectPath={vi.fn()}
        coreGoal="Launch the platform"
        setCoreGoal={vi.fn()}
        saving={false}
        canSave
        pathToolsVisible
        pathSuggestionsOpen={false}
        setPathSuggestionsOpen={vi.fn()}
        pathSuggestionsLoading={false}
        pathSuggestions={[]}
        missingPathPrompt={null}
        setMissingPathPrompt={vi.fn()}
        pathApiUnsupported={false}
        setPathApiUnsupported={vi.fn()}
        nativePathPicking={false}
        setNativePathPicking={vi.fn()}
        nativePickerUnsupported={false}
        setNativePickerUnsupported={vi.fn()}
        setManualPathPickerOpen={vi.fn()}
        loadManualPathEntries={vi.fn(async () => {})}
        unsupportedPathApiMessage="unsupported"
        resolvePathHelperErrorMessage={() => "error"}
        formFeedback={null}
        setFormFeedback={vi.fn()}
        assignmentMode="auto"
        setAssignmentMode={vi.fn()}
        setManualAssignmentWarning={vi.fn()}
        manualSelectionStats={{ total: 0, leaders: 0, subordinates: 0 }}
        selectedAgentIds={new Set()}
        setSelectedAgentIds={vi.fn()}
        agentFilterDept="all"
        setAgentFilterDept={vi.fn()}
        agents={[]}
        departments={[]}
        spriteMap={new Map()}
        onSave={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEditSelected={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Auto-create GitHub repository")).toBeInTheDocument();
    expect(screen.getByDisplayValue("platform")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Private" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument();
    expect(screen.getByText("Project Path (Auto)")).toBeInTheDocument();
    expect(screen.getByText("Default project root")).toBeInTheDocument();
  });
});
