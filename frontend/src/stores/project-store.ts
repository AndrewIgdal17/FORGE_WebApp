import { create } from 'zustand';

import {
  deleteProject as deleteProjectApi,
  duplicateProject as duplicateProjectApi,
  updateProject as updateProjectApi,
} from '@/lib/api';
import type { ProjectResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  sending_name: string;
  receiving_name: string;
  sending_substation_gid: number | null;
  receiving_substation_gid: number | null;
  sending_point: [number, number] | null;
  receiving_point: [number, number] | null;
  base_scenario_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface ProjectStore {
  projects: Project[];
  loading: boolean;

  loadProjects: () => Promise<void>;
  renameProject: (id: string, name: string, revision: number) => Promise<Project>;
  setBase: (id: string, scenarioId: string, revision: number) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Project>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pointFromGeoJson(value: unknown): [number, number] | null {
  if (!isRecord(value) || value.type !== 'Point') return null;
  const coords = value.coordinates;
  if (
    !Array.isArray(coords) ||
    coords.length < 2 ||
    typeof coords[0] !== 'number' ||
    typeof coords[1] !== 'number'
  ) {
    return null;
  }
  return [coords[0], coords[1]];
}

function rowToProject(row: Record<string, unknown>): Project {
  const sending = pointFromGeoJson(row.sending_point_geojson);
  const receiving = pointFromGeoJson(row.receiving_point_geojson);
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    sending_name: String(row.sending_name),
    receiving_name: String(row.receiving_name),
    sending_substation_gid:
      typeof row.sending_substation_gid === 'number'
        ? row.sending_substation_gid
        : null,
    receiving_substation_gid:
      typeof row.receiving_substation_gid === 'number'
        ? row.receiving_substation_gid
        : null,
    sending_point: sending,
    receiving_point: receiving,
    base_scenario_id:
      row.base_scenario_id != null ? String(row.base_scenario_id) : null,
    revision: typeof row.revision === 'number' ? row.revision : 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function fromProjectResponse(response: ProjectResponse): Project {
  const sending = pointFromGeoJson(response.sending_point);
  const receiving = pointFromGeoJson(response.receiving_point);
  return {
    id: response.id,
    user_id: response.user_id,
    name: response.name,
    sending_name: response.sending_name,
    receiving_name: response.receiving_name,
    sending_substation_gid: response.sending_substation_gid,
    receiving_substation_gid: response.receiving_substation_gid,
    sending_point: sending,
    receiving_point: receiving,
    base_scenario_id: response.base_scenario_id,
    revision: response.revision,
    created_at: response.created_at,
    updated_at: response.updated_at,
  };
}

function upsertProject(projects: Project[], project: Project): Project[] {
  const index = projects.findIndex((item) => item.id === project.id);
  if (index < 0) return [...projects, project];
  const next = [...projects];
  next[index] = project;
  return next;
}

export function isProjectReadOnly(
  project: Project,
  scenarios: Array<{ id: string; source: string }>,
  userId: string,
): boolean {
  if (project.user_id !== userId) return true;
  return scenarios.some((scenario) => scenario.source === 'paper');
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('project_read')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      const projects = ((data ?? []) as Array<Record<string, unknown>>).map(
        rowToProject,
      );
      set({ projects, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  renameProject: async (id, name, revision) => {
    const response = await updateProjectApi(id, { revision, name });
    const project = fromProjectResponse(response);
    set((state) => ({
      projects: upsertProject(state.projects, project),
    }));
    return project;
  },

  setBase: async (id, scenarioId, revision) => {
    const response = await updateProjectApi(id, {
      revision,
      base_scenario_id: scenarioId,
    });
    const project = fromProjectResponse(response);
    set((state) => ({
      projects: upsertProject(state.projects, project),
    }));
    return project;
  },

  removeProject: async (id) => {
    await deleteProjectApi(id);
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== id),
    }));
  },

  duplicate: async (id) => {
    const { project: response } = await duplicateProjectApi(id);
    const project = fromProjectResponse(response);
    set((state) => ({
      projects: upsertProject(state.projects, project),
    }));
    return project;
  },
}));