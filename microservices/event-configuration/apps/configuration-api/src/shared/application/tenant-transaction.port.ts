export const TENANT_TRANSACTION = Symbol('TENANT_TRANSACTION');

export interface TenantTransaction {
  withTenantTransaction<T>(organizationId: string, action: () => Promise<T>): Promise<T>;
}
