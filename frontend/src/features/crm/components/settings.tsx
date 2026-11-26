'use client';
import { ImportMappings } from '@/features/lead-imports/components/import-mappings';
import { Accounts } from '@/features/accounts/components/accounts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
  const sellers =
    users.data?.filter((seller) =>
      seller.roles.some((role) => ['ADMIN', 'VENDEDOR'].includes(role.role.name))
    ) ?? [];
  if (!admin) return <p>Acceso restringido.</p>;
  return (
    <CrmContent>
      <div className='leads-content'>
        <div className='leads-heading'>
          <h1>Administrador</h1>
          <p>Usuarios, reparto automático y bases de origen.</p>
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
            <TabsTrigger value='imports'>Importación Excel</TabsTrigger>
          </TabsList>
          <TabsContent value='users'>
            <Accounts actorId={user.id} />
          </TabsContent>
          <TabsContent value='allocation'>
            <Card>
              <CardHeader>
                <CardTitle>Equipo comercial y reparto</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  La rotación incluye administradores y vendedores activos con recepción habilitada.
                  Al reactivar se distribuyen los pendientes por antigüedad.
                </p>
                {users.isPending && <LoadingState label='Cargando equipo comercial…' rows={2} />}
                {users.isSuccess && sellers.length === 0 && (
                  <EmptyState
                    title='Todavía no hay usuarios para el reparto'
                    description='Creá una cuenta de administrador o vendedor desde Usuarios para incorporarla al reparto.'
                  />
                )}
                <ul className='grid gap-3 pt-3'>
                  {sellers.map((seller) => (
                    <li key={seller.id} className='border-border rounded-lg border p-3'>
                      <strong>{personName(seller)}</strong>
                      <p>{seller.email}</p>
                      <p>
                        {seller.roles.some((role) => role.role.name === 'ADMIN')
                          ? 'Administrador'
                          : 'Vendedor'}
                      </p>
                      <p>
                        {seller.isActive ? 'Cuenta activa' : 'Cuenta inactiva'} ·{' '}
                        {seller.isActive && seller.receivesLeads
                          ? 'Recepción habilitada'
                          : 'Recepción pausada'}
                      </p>
                      <div className='flex flex-wrap items-center gap-3 pt-2'>
                        <Switch
                          id={`receives-leads-${seller.id}`}
                          checked={seller.isActive && seller.receivesLeads}
                          disabled={action.pending || !seller.isActive}
                          aria-label={`Recibir leads: ${personName(seller)}`}
                          onCheckedChange={(receivesLeads) =>
                            void action.run(
                              async () => {
                                await crmRequest(`users/${seller.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ receivesLeads })
                                });
                                await refresh();
                              },
                              receivesLeads
                                ? 'Recepción de leads habilitada.'
                                : 'Recepción de leads pausada.'
                            )
                          }
                        />
                        <label htmlFor={`receives-leads-${seller.id}`}>Recibir leads</label>
                      </div>
                      {!seller.isActive && (
                        <p className='text-muted-foreground pt-2 text-sm'>
                          Reactivá la cuenta desde Usuarios para habilitar su recepción.
                        </p>
                      )}
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
          <TabsContent value='imports'>
            <ImportMappings actorId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </CrmContent>
  );
}
