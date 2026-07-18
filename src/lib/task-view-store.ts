import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TaskViewMode = "side" | "modal";

type TaskViewStore = {
  mode: TaskViewMode;
  toggleMode: () => void;
};

export const useTaskViewStore = create<TaskViewStore>()(
  persist(
    (set, get) => ({
      mode: "side",
      toggleMode: () => set({ mode: get().mode === "side" ? "modal" : "side" }),
    }),
    { name: "task-view-mode", skipHydration: true },
  ),
);
