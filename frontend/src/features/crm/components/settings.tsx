'use client';
import { Accounts } from '@/features/accounts/components/accounts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { FieldGroup } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type Catalogs,
  type Identity,
  type Seller,
  crmRequest,
  personName,
  useCrmQuery,
  useIdentity,
  useRefreshCrm
} from '../api';
import { EmptyState, Feedback, LoadingState, TextField, useAction } from './shared';

export function CommercialSettings({ actor }: { actor: Identity }) {
  const identity = useIdentity(actor);
  const user = identity.data ?? actor;
  const admin = user.roles.includes('ADMIN');
  const users = useCrmQuery<Seller[]>(user.id, 'users', admin);
  const catalogs = useCrmQuery<Catalogs>(user.id, 'catalogs', admin);
  const action = useAction();
  const refresh = useRefreshCrm();
  if (!admin) return <p>Acceso restringido.</p>;
  return (
    <CrmContent>
      <div className='leads-content'>
        <div className='leads-heading'>
          <h1>Administrador</h1>
          <p>Vendedores, reparto automático y bases de origen.</p>
        </div>
        <Feedback
          error={identity.error ?? users.error ?? catalogs.error}
          onRetry={() => {
            void identity.refetch();
            void users.refetch();
            void catalogs.refetch();
          }}
          retrying={users.isFetching || catalogs.isFetching}
        />
        <Feedback error={action.error} message={action.message} pending={action.pending} />
        <Tabs defaultValue='users'>
          <TabsList>
            <TabsTrigger value='users'>Usuarios</TabsTrigger>
            <TabsTrigger value='allocation'>Reparto</TabsTrigger>
            <TabsTrigger value='sources'>Bases</TabsTrigger>
          </TabsList>
          <TabsContent value='users'>
            <Accounts actorId={user.id} />
          </TabsContent>
          <TabsContent value='allocation'>
            <Card>
              <CardHeader>
                <CardTitle>Vendedores y reparto</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  La rotación usa vendedores activos con recepción habilitada. Al reactivar se
                  distribuyen los pendientes por antigüedad.
                </p>
                {users.isPending && <LoadingState label='Cargando vendedores…' rows={2} />}
                {users.isSuccess &&
                  !users.data.some(
                    (seller) =>
                      seller.isActive && seller.roles.some((role) => role.role.name === 'VENDEDOR')
                  ) && (
                    <EmptyState
                      title='Todavía no hay vendedores'
                      description='Creá una cuenta y habilitá su recepción para incorporarla al reparto.'
                    />
                  )}
                <ul className='grid gap-3 pt-3'>
                  {users.data
                    ?.filter(
                      (seller) =>
                        seller.isActive &&
                        seller.roles.some((role) => role.role.name === 'VENDEDOR')
                    )
                    .map((seller) => (
                      <li key={seller.id} className='border-border rounded-lg border p-3'>
                        <strong>{personName(seller)}</strong>
                        <p>{seller.email}</p>
                        <p>
                          {seller.isActive ? 'Cuenta activa' : 'Cuenta inactiva'} ·{' '}
                          {seller.receivesLeads ? 'Recepción habilitada' : 'Recepción pausada'}
                        </p>
                        <div className='flex flex-wrap gap-2 pt-2'>
                          <Button
                            size='sm'
                            disabled={action.pending}
                            onClick={() =>
                              void action.run(async () => {
                                await crmRequest(`users/${seller.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ receivesLeads: !seller.receivesLeads })
                                });
                                await refresh();
                              })
                            }
                          >
                            {seller.receivesLeads ? 'Pausar recepción' : 'Habilitar recepción'}
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='sources'>
            <Card>
              <CardHeader>
                <CardTitle>Orígenes y bases</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const name = String(new FormData(form).get('base-name'));
                    void action.run(
                      async () => {
                        await crmRequest('sources', {
                          method: 'POST',
                          body: JSON.stringify({ name })
                        });
                        form.reset();
                        await refresh();
                      },
                      'Base creada.',
                      'create-source'
                    );
                  }}
                >
                  <fieldset disabled={action.pending} className='min-w-0'>
                    <FieldGroup>
                      <TextField
                        label='Nombre de la nueva base'
                        name='base-name'
                        required
                        maxLength={100}
                      />
                      <LoadingButton
                        type='submit'
                        disabled={action.pending}
                        loading={action.pending && action.active === 'create-source'}
                        loadingLabel='Creando base…'
                      >
                        Crear base
                      </LoadingButton>
                    </FieldGroup>
                  </fieldset>
                </form>
                {catalogs.isPending && <LoadingState label='Cargando orígenes…' rows={2} />}
                <ul className='grid gap-2 pt-4'>
                  {catalogs.data?.sources.map((source) => (
                    <li
                      key={source.id}
                      className='flex flex-wrap items-center justify-between gap-2'
                    >
                      <span>
                        {source.name} · {source.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                      {source.isBase && (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={action.pending}
                          onClick={() =>
                            void action.run(async () => {
                              await crmRequest(`sources/${source.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isActive: !source.isActive })
                              });
                              await refresh();
                            })
                          }
                        >
                          {source.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CrmContent>
  );
}
