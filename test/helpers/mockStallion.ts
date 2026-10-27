/**
 * Typed facade over the headless Cavalry/Stallion mock in
 * test/mock-cavalry-api.js. The JavaScript module is the single source of
 * truth so CI and direct Node runs share exactly the same bridge behaviour.
 */
export {
  createMockApiState,
  buildMockApi,
  executeInMock,
  startMockStallion,
} from "../mock-cavalry-api.js";
export type {
  MockApi,
  MockApiHooks,
  MockApiState,
  MockComp,
  MockEasing,
  MockKeyframe,
  MockLayer,
} from "../mock-cavalry-api.js";
