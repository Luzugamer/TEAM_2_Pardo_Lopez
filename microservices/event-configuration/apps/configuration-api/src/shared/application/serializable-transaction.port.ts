export const SERIALIZABLE_TRANSACTION = Symbol('SERIALIZABLE_TRANSACTION');

export interface SerializableTransaction {
  withSerializableTransaction<T>(organizationId: string, action: () => Promise<T>): Promise<T>;
}
