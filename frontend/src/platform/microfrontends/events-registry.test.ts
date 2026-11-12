import {describe,expect,it} from 'vitest';
import {findModuleForRoute,moduleRegistry,validateRegistry,visibleModules} from './registry';
describe('events registry integration',()=>{
 it('contains unique events routes and retains Onsite',()=>{expect(validateRegistry()).toEqual([]);expect(findModuleForRoute('/onsite')?.id).toBe('onsite-operations');expect(findModuleForRoute('/events/agenda')?.id).toBe('events')});
 it('requires an events capability even for a direct URL',()=>{expect(findModuleForRoute('/events/agenda',visibleModules([]))).toBeUndefined();expect(findModuleForRoute('/events/agenda',visibleModules(['events:read']))?.id).toBe('events')});
});
