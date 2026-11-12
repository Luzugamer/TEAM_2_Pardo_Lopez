import {describe,expect,it} from 'vitest';
import {eventPermissions} from './capabilities';

describe('event capabilities',()=>{
 it('distinguishes read, write and publish',()=>{
  expect(eventPermissions([])).toEqual({read:false,write:false,publish:false});
  expect(eventPermissions(['events:read'])).toEqual({read:true,write:false,publish:false});
  expect(eventPermissions(['events:read','events:write'])).toEqual({read:true,write:true,publish:false});
  expect(eventPermissions(['events:read','events:publish'])).toEqual({read:true,write:false,publish:true});
 });
 it('does not let a mock actor grant permissions absent from the shell',()=>{
  expect(eventPermissions(['events:read'],'org-a-manager')).toEqual({read:true,write:false,publish:false});
  expect(eventPermissions(['events:read','events:write','events:publish'],'org-a-reader')).toEqual({read:true,write:false,publish:false});
 });
});
