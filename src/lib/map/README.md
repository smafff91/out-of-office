# map

The only place that imports MapLibre GL JS (OpenFreeMap, modified Positron style with Latte colors).

The rest of the app talks to the map through components and functions exported from here,
so the map provider can be swapped later (plan B: Apple MapKit JS).
The "© OpenStreetMap contributors" attribution must always be visible.
