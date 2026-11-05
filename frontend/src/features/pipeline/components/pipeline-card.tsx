'use client';

import { IconCalendar, IconDotsVertical, IconGripVertical, IconShield } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { KanbanItem, KanbanItemHandle } from '@/components/ui/kanban';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { stages, type OpportunityPreview, type StageId } from '../data/demo-opportunities';

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: 'short'
});

export function PipelineCard({
  opportunity,
  stage,
  onMove,
  onDetail
}: {
  opportunity: OpportunityPreview;
  stage: StageId;
  onMove: (id: string, stage: StageId) => void;
  onDetail: (opportunity: OpportunityPreview) => void;
}) {
  return (
    <KanbanItem value={opportunity.id} className='pipeline-item'>
      <Card size='sm' className='pipeline-card'>
        <CardHeader>
          <CardTitle>
            <button onClick={() => onDetail(opportunity)}>{opportunity.name}</button>
          </CardTitle>
          <CardDescription>{opportunity.company}</CardDescription>
          <CardAction>
            <Badge
              variant='secondary'
              className='pipeline-priority'
              data-priority={opportunity.priority}
            >
              <IconShield aria-hidden='true' />
              {opportunity.priority}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className='pipeline-card-meta'>
          <Badge variant='secondary' className='pipeline-source'>
            {opportunity.source}
          </Badge>
          <div className='pipeline-card-actions'>
            <KanbanItemHandle
              render={
                <Button
                  variant='ghost'
                  size='icon-xs'
                  aria-label={`Arrastrar ${opportunity.name}`}
                />
              }
            >
              <IconGripVertical />
            </KanbanItemHandle>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    aria-label={`Acciones de ${opportunity.name}`}
                  />
                }
              >
                <IconDotsVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onDetail(opportunity)}>
                    Ver oportunidad
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Mover a etapa · demo</DropdownMenuLabel>
                  {stages.map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      disabled={target.id === stage}
                      onClick={() => onMove(opportunity.id, target.id)}
                    >
                      {target.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
        <CardFooter>
          <span className='pipeline-assignee'>
            <Avatar size='sm'>
              <AvatarFallback>{opportunity.seller.slice(-1)}</AvatarFallback>
            </Avatar>
            <span>{opportunity.seller}</span>
          </span>
          <span className='pipeline-date'>
            <IconCalendar aria-hidden='true' />
            {opportunity.nextActivity ? (
              <time dateTime={opportunity.nextActivity}>
                {dateFormat.format(new Date(opportunity.nextActivity))}
              </time>
            ) : (
              'Sin fecha'
            )}
          </span>
        </CardFooter>
      </Card>
    </KanbanItem>
  );
}
