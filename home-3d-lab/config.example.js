// Public settings only. A publishable/legacy anon key is safe with the supplied RLS.
// Never put a service_role key, OAuth secret, token, or private model URL here.
export default {
  supabaseUrl: '', // e.g. https://YOUR_PROJECT.supabase.co
  supabasePublishableKey: '', // sb_publishable_… or legacy anon JWT
  maxModelBytes: 100 * 1024 * 1024,
  // Exact/partial case-insensitive names; use exporter names from your own GLB.
  groups: {
    exterior: ['Exterior', 'Facade'], interior: ['Interior'], roof: ['Roof'],
    floors: ['Floor'], walls: ['Wall'], doors: ['Door'], windows: ['Window'],
    furniture: ['Furniture', 'Sofa', 'Table', 'Bed'], surroundings: ['Surroundings'],
  },
};
