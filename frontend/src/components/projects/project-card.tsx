import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Project } from '@/stores/project-store';

export interface ProjectCardProps {
  project: Project;
  scenarioCount: number;
  ownerName: string;
  isOwner: boolean;
  onOpen: (project: Project) => void;
  onRename: (project: Project) => void;
  onDuplicate: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectCard({
  project,
  scenarioCount,
  ownerName,
  isOwner,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectCardProps): ReactElement {
  return (
    <Card size="sm" className="overflow-visible">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <CardTitle className="font-bold">{project.name}</CardTitle>
          <CardDescription className="text-xs opacity-80">
            {project.sending_name} → {project.receiving_name}
          </CardDescription>
          <CardDescription className="mt-1 text-xs opacity-60">
            {scenarioCount} scenario{scenarioCount === 1 ? '' : 's'}
            {ownerName ? ` · ${ownerName}` : ''}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button type="button" size="sm" onClick={() => onOpen(project)}>
            Open
          </Button>
          {isOwner ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRename(project)}
            >
              Rename
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDuplicate(project)}
          >
            Duplicate
          </Button>
          {isOwner ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onDelete(project)}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}