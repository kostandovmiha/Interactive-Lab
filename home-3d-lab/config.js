// Public settings only. A publishable/legacy anon key is safe with the supplied RLS.
// Never put a service_role key, OAuth secret, token, or private model URL here.
export default {
  supabaseUrl: 'https://hygrbwknazmguduhvqyi.supabase.co',
  supabasePublishableKey: 'sb_publishable_xJNsk1iSstzrPuv9kiCkSg_s8iHxSTy',
  maxModelBytes: 100 * 1024 * 1024,
  // Exact/partial case-insensitive names; use exporter names from your own GLB.
  groups: {
    exterior: ['Exterior', 'Facade'], interior: ['Interior'], roof: ['Roof'],
    floors: ['Floor'], walls: ['Wall'], doors: ['Door'], windows: ['Window'],
    furniture: ['Furniture', 'Sofa', 'Table', 'Bed'], surroundings: ['Surroundings'],
  },
};
