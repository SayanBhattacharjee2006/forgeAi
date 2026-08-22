"use client";

import { create } from "zustand";
import type { Project, ProjectCreate, ProjectSettingsUpdate, ProjectAIConfig, MemberDetail } from "@/types";
import { api } from "@/lib/api";

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;
  isCreateDialogOpen: boolean;
  isJoinDialogOpen: boolean;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  openJoinDialog: () => void;
  closeJoinDialog: () => void;
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string, silent?: boolean) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  createProject: (data: ProjectCreate) => Promise<Project>;
  updateProjectSettings: (id: string, data: ProjectSettingsUpdate) => Promise<Project>;
  updateAIConfig: (id: string, config: ProjectAIConfig) => Promise<ProjectAIConfig>;
  updateMemberRole: (projectId: string, userId: string, role: "owner" | "member") => Promise<MemberDetail>;
  removeMember: (projectId: string, userId: string) => Promise<void>;
  inviteMember: (projectId: string, githubUsername: string) => Promise<MemberDetail>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,
  isCreateDialogOpen: false,
  isJoinDialogOpen: false,

  openCreateDialog: () => set({ isCreateDialogOpen: true }),
  closeCreateDialog: () => set({ isCreateDialogOpen: false }),
  openJoinDialog: () => set({ isJoinDialogOpen: true }),
  closeJoinDialog: () => set({ isJoinDialogOpen: false }),

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await api.get<Project[]>("/projects");
      set({ projects, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchProject: async (id: string, silent: boolean = false) => {
    if (!silent) {
      set({ isLoading: true, error: null });
    }
    try {
      const project = await api.get<Project>(`/projects/${id}`);
      set((state) => ({
        currentProject: project,
        projects: state.projects.map((p) => (p.project_id === id ? project : p)),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  createProject: async (data) => {
    const project = await api.post<Project>("/projects", data);
    set((state) => ({ projects: [project, ...state.projects], currentProject: project }));
    return project;
  },

  updateProjectSettings: async (id: string, data: ProjectSettingsUpdate) => {
    const updated = await api.put<Project>(`/projects/${id}/settings`, data);
    set((state) => ({
      currentProject: state.currentProject?.project_id === id ? updated : state.currentProject,
      projects: state.projects.map((p) => (p.project_id === id ? updated : p)),
    }));
    return updated;
  },

  updateAIConfig: async (id: string, config: ProjectAIConfig) => {
    const updated = await api.put<ProjectAIConfig>(`/projects/${id}/ai-config`, config);
    set((state) => {
      if (state.currentProject && state.currentProject.project_id === id) {
        return {
          currentProject: {
            ...state.currentProject,
            ai_config: updated,
          },
        };
      }
      return state;
    });
    return updated;
  },

  updateMemberRole: async (projectId: string, userId: string, role: "owner" | "member") => {
    const updatedMember = await api.put<MemberDetail>(`/projects/${projectId}/members/${userId}/role`, { role });
    await get().fetchProject(projectId, true);
    return updatedMember;
  },

  removeMember: async (projectId: string, userId: string) => {
    await api.delete(`/projects/${projectId}/members/${userId}`);
    await get().fetchProject(projectId, true);
  },

  inviteMember: async (projectId: string, githubUsername: string) => {
    const newMember = await api.post<MemberDetail>(`/projects/${projectId}/members/invite`, {
      github_username: githubUsername,
    });
    await get().fetchProject(projectId, true);
    return newMember;
  },

  deleteProject: async (id: string) => {
    await api.delete(`/projects/${id}`);
    set((state) => ({
      projects: state.projects.filter((p) => p.project_id !== id),
      currentProject: state.currentProject?.project_id === id ? null : state.currentProject,
    }));
  },
}));
