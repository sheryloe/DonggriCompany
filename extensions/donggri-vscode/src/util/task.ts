import type { DonggriTaskRef, DonggriTaskStatus } from "../types";

const statusWeight: Record<DonggriTaskStatus, number> = {
  in_progress: 0,
  review: 1,
  pending: 2,
  planned: 3,
  inbox: 4,
  collaborating: 5,
  done: 6,
  cancelled: 7,
};

export function sortTasks(tasks: DonggriTaskRef[]): DonggriTaskRef[] {
  return [...tasks].sort((left, right) => {
    const statusDelta = (statusWeight[left.status] ?? 99) - (statusWeight[right.status] ?? 99);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return right.updated_at - left.updated_at;
  });
}

export function matchTaskByQuery(tasks: DonggriTaskRef[], query?: string): DonggriTaskRef | undefined {
  const sorted = sortTasks(tasks);
  if (!query?.trim()) {
    return sorted[0];
  }

  const normalized = query.trim().toLowerCase();

  return (
    sorted.find((task) => task.id.toLowerCase() === normalized) ??
    sorted.find((task) => task.id.toLowerCase().startsWith(normalized)) ??
    sorted.find((task) => task.title.toLowerCase() === normalized) ??
    sorted.find((task) => task.title.toLowerCase().includes(normalized))
  );
}

export function formatTaskStatus(status: DonggriTaskStatus): string {
  switch (status) {
    case "in_progress":
      return "Running";
    case "pending":
      return "Paused";
    case "planned":
      return "Planned";
    case "review":
      return "Review";
    case "done":
      return "Done";
    case "cancelled":
      return "Cancelled";
    case "collaborating":
      return "Collaborating";
    case "inbox":
      return "Inbox";
    default:
      return status;
  }
}
