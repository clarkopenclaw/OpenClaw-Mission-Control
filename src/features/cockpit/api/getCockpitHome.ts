import { cockpitHomeResponseSchema, type CockpitHomeResponse } from '../../../../shared/schemas/cockpit';
import { apiGet } from '../../../shared/api/client';

export function getCockpitHome(): Promise<CockpitHomeResponse> {
  return apiGet('/api/cockpit/home', cockpitHomeResponseSchema);
}
