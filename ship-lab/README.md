# Ship Lab

Browser-based procedural spacecraft prototype built with Three.js (ES modules via jsDelivr).

**Live page:** https://kostandovmiha.github.io/Interactive-Lab/ship-lab/

## Version 1.1 (2026-10-08)

### Geometry fixes
- Replaced the inverted taper/cylinder nose with an angular, closed, pointed fuselage loft.
- Switched wing creation to `THREE.ExtrudeGeometry`: port and starboard wings are each made from a 2D outline, allowing consistent outward normals independently of mirrored point order.
- Default 3/4 camera now faces the **nose** (-Z) instead of the aft (+Z) engines.
- Model root: `ShipLab_V1_1`; wing meshes: `Wing_Port` and `Wing_Starboard`.

### Features
- Three hull types: Interceptor, Courier, Heavy.
- Three wing plans: Swept, Delta, Forward.
- Hull length, wingspan, sweep, 1/2/4 engines, four paint choices.
- Mouse/touch orbit, auto rotation, front/top/rear/3/4 preset views.
- Wireframe diagnostic switch.
- Save PNG, export GLB, share configuration through URL hash.

### Suggested 3ds Max 2022 checks
1. Open Ship Lab with **Ctrl+F5** to avoid a cached previous version.
2. Verify the point of the nose is on **-Z** (use the Front view) and engine exhausts on **+Z** (Rear view).
3. Try all three wing shapes and both small / large spans. Check no vanishing surfaces, strange black triangles, or overlapping wings.
4. Export GLB and import it into Max 2022.
5. Inspect `Wing_Port` and `Wing_Starboard` separately in Edit Normals / Face Orientation. The outer (top) wing faces should point outward (+Y), the undersides outward (-Y) and the edges outward.
6. Check hull/cockpit/cabin and engine materials; inspect visible faces from top and bottom. Compare front/rear views.
7. Try a non-default configuration, copy URL, open in another tab, check all parameters remain.
8. Test at mobile resolution if convenient.

**Coordinate convention:** Y is up, ship nose faces -Z, engines face +Z. glTF represents distances in meters; imported 3ds Max unit scale depends on importer and Max system units.

**Limitations:** This is a procedural concept generator, not a watertight production asset with UVs and optimized quad topology. It uses CDN-hosted Three.js, so first load requires internet access. Browser WebGL support is required.

## Acceptance history
- V1: user-confirmed PASS (5/5): GitHub Pages, WebGL orbit, live sliders, GLB download, 3ds Max 2022 import.
- V1.1: revised geometry and added controls committed; **live browser and Max validation pending**.
