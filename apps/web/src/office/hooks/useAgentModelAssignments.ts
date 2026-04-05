"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AgentId,
  AgentModelAssignmentView,
  UpsertAgentModelAssignmentRequest
} from "@workspace/shared";

import {
  listAgentModelAssignments,
  upsertAgentModelAssignment
} from "../../lib/api/office-step2";

type UseAgentModelAssignmentsResult = {
  assignments: AgentModelAssignmentView[];
  assignmentByAgentId: Partial<Record<AgentId, AgentModelAssignmentView>>;
  isLoading: boolean;
  isMutating: boolean;
  errorMessage: string | null;
  actionMessage: string | null;
  refresh: () => Promise<void>;
  upsert: (
    agentId: AgentId,
    payload: UpsertAgentModelAssignmentRequest
  ) => Promise<AgentModelAssignmentView | null>;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

export const useAgentModelAssignments = (): UseAgentModelAssignmentsResult => {
  const [assignments, setAssignments] = useState<AgentModelAssignmentView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    try {
      const response = await listAgentModelAssignments();
      setAssignments(response.assignments);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsert = useCallback(
    async (
      agentId: AgentId,
      payload: UpsertAgentModelAssignmentRequest
    ): Promise<AgentModelAssignmentView | null> => {
      setIsMutating(true);
      setErrorMessage(null);
      setActionMessage(null);
      try {
        const response = await upsertAgentModelAssignment(agentId, payload);
        setAssignments((previous) => {
          const filtered = previous.filter((item) => item.agentId !== response.assignment.agentId);
          return [...filtered, response.assignment].sort((a, b) =>
            a.agentId.localeCompare(b.agentId)
          );
        });
        setActionMessage(`saved:${agentId}`);
        return response.assignment;
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const assignmentByAgentId = useMemo(() => {
    return assignments.reduce((accumulator, current) => {
      accumulator[current.agentId] = current;
      return accumulator;
    }, {} as Partial<Record<AgentId, AgentModelAssignmentView>>);
  }, [assignments]);

  return {
    assignments,
    assignmentByAgentId,
    isLoading,
    isMutating,
    errorMessage,
    actionMessage,
    refresh,
    upsert
  };
};
