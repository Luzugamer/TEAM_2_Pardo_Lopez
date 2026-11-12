import type { Capability } from '../../platform/microfrontends/contracts';

export const EVENTS_CAPABILITIES = {
  read: 'events:read',
  write: 'events:write',
  publish: 'events:publish',
} as const satisfies Record<string, Capability>;

/** The development actor can only reduce, never expand, the shell capabilities. */
export function eventPermissions(capabilities: readonly Capability[], demoActor?: string) {
  const isReader = demoActor === 'org-a-reader';
  return {
    read: capabilities.includes(EVENTS_CAPABILITIES.read) || capabilities.includes(EVENTS_CAPABILITIES.write),
    write: !isReader && capabilities.includes(EVENTS_CAPABILITIES.write),
    publish: !isReader && capabilities.includes(EVENTS_CAPABILITIES.publish),
  };
}
