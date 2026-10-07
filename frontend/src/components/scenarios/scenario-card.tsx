import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatTimestamp } from '@/lib/format';
import type { Scenario } from '@/stores/scenario-store';

export interface ScenarioCardProps {
  scenario: Scenario;
  currentUserId: string | null;
  onOpen: (scenario: Scenario) => void;
  onRename: (scenario: Scenario) => void;
  onDuplicate: (scenario: Scenario) => void;
  onDelete: (scenario: Scenario) => void;
  onExportForge: (scenario: Scenario) => void;
  onExportCsv: (scenario: Scenario) => void;
}

function lockedReason(isSystem: boolean, action: 'rename' | 'delete'): string {
  if (isSystem) {
    return action === 'rename'
      ? 'System scenarios cannot be renamed'
      : 'System scenarios cannot be deleted';
  }
  return action === 'rename'
    ? 'Only the owner can rename this scenario'
    : 'Only the owner can delete this scenario';
}

export function ScenarioCard({
  scenario,
  currentUserId,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExportForge,
  onExportCsv,
}: ScenarioCardProps): ReactElement {
  const isSystem = scenario.source === 'system';
  const isOwner = currentUserId !== null && scenario.user_id === currentUserId;
  const canRenameOrDelete = isOwner && !isSystem;

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="font-bold">{scenario.name}</CardTitle>
          <CardDescription>{formatTimestamp(scenario.updated_at)}</CardDescription>
          {scenario.ownerUsername ? (
            <p className="text-xs text-muted-foreground">{scenario.ownerUsername}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {isSystem ? (
            <Button type="button" size="sm" onClick={() => onDuplicate(scenario)}>
              Duplicate & Edit
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => onOpen(scenario)}>
              Open
            </Button>
          )}
          <span title={canRenameOrDelete ? undefined : lockedReason(isSystem, 'rename')}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canRenameOrDelete}
              onClick={() => onRename(scenario)}
            >
              Rename
            </Button>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDuplicate(scenario)}
          >
            Duplicate
          </Button>
          <span title={canRenameOrDelete ? undefined : lockedReason(isSystem, 'delete')}>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!canRenameOrDelete}
              onClick={() => onDelete(scenario)}
            >
              Delete
            </Button>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onExportForge(scenario)}
          >
            Export (.forge)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onExportCsv(scenario)}
          >
            Export (CSV)
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
