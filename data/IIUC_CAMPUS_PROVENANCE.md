# IIUC Campus Data Provenance

## Summary

`data/iiuc-campus.geojson` and the rows seeded by `scripts/seed-iiuc-campus.js` are derived
from an OpenStreetMap map extract. No Google Maps data was scraped or copied. OpenStreetMap
is open data available under the Open Database License (ODbL 1.0).

- **Data source:** OpenStreetMap
- **Source URL:**
  `https://api.openstreetmap.org/api/0.6/map?bbox=91.7182,22.4894,91.7305,22.5001`
- **Downloaded:** 2026-11-08 at 12:45:57 Bangladesh Standard Time (UTC+06:00)
- **Local extract used:** `C:\Users\Montaherul\AppData\Local\Temp\iiuc_map.osm`
  (654,470 bytes, OSM API 0.6 XML, 2,542 nodes / 403 ways / 3 relations)
- **Campus boundary element:** OpenStreetMap way `276731950`
  (`amenity=university`, closed ring, 27 nodes, name "International Islamic University Chittagong")
- **Bounding box:** south 22.4894, west 91.7182, north 22.5001, east 91.7305 (WGS84)
- **Centre used for sanity checks:** approximately 22.495154, 91.724368

If the extract is missing, re-download it with:

```powershell
curl.exe -L "https://api.openstreetmap.org/api/0.6/map?bbox=91.7182,22.4894,91.7305,22.5001" -o "$env:TEMP\iiuc_map.osm"
node scripts/build-iiuc-campus-geojson.js "$env:TEMP\iiuc_map.osm"
```

## Attribution and licence

> Data © OpenStreetMap contributors, available under the Open Database License (ODbL) 1.0.
> https://www.openstreetmap.org/copyright
> https://opendatacommons.org/licenses/odbl/1-0/

The seeded campus database is a Derivative Database of OSM data for ODbL purposes. Any public
use of the data or of maps rendered from it must retain this attribution. OSM data is provided
"as is"; the OSM community makes no warranty of accuracy.

## Delivered files

| File | Purpose |
| --- | --- |
| `data/iiuc-campus.geojson` | Committed FeatureCollection of the 183 seeded features |
| `scripts/seed-iiuc-campus.js` | Idempotent SQLite seeder (deletes only `source LIKE 'OpenStreetMap %'`) |
| `scripts/build-iiuc-campus-geojson.js` | Rebuilds the GeoJSON from the OSM XML extract (reproducibility) |
| `data/IIUC_CAMPUS_PROVENANCE.md` | This provenance and methodology note |

Every feature carries `osmType`, `osmId`, `name`, `kind`, `category`, `source` and
`description`. `source` is always `OpenStreetMap way/<id>` or `OpenStreetMap node/<id>`.
Names come only from the OSM `name` tag. Unnamed features have `name: null` in the GeoJSON and
receive a transparent database label such as `Unnamed building (OSM way/517840673)`; no names
were invented.

## Feature counts

| Kind | Category | Features | Named | Unnamed | Geometry |
| --- | --- | ---: | ---: | ---: | --- |
| building | Buildings | 123 | 27 | 96 | 123 Polygon |
| road | Roads & Paths | 38 | 4 | 34 | 38 LineString |
| poi | Campus Facilities | 22 | 17 | 5 | 15 Polygon, 7 Point |
| **Total** | | **183** | **48** | **135** | 138 Polygon, 38 LineString, 7 Point |

Source-element mix: 176 ways and 7 nodes.

Notable named features include IIUC Central Mosque, IIUC Central Library, IIUC Central
Auditorium, IIUC Cafeteria, IIUC Academic Building-4, IIUC Academic Building 2, IIUC Academic
Building 5, IIUC Administrative Building 1, IIUC Faculty of Science & Engineering Building,
Faculty of Law, IIUC CSE Dpt Main Building, IIUC Medical Center, IIUC Post Office, IIUC Central
Field, IIUC Shaheeed Minar, IIUC Water Treatment Plant, IIUC Road, and the campus boundary
polygon itself.

## Classification and filter rules

### Campus area

- The IIUC boundary is OSM way `276731950`. Point-in-polygon tests use its actual ring.
- Polygon features are tested using an area-weighted centroid. Line features are tested using
  the midpoint measured along the line and, as a fallback, whether any vertex is inside.
- The two named `landuse=education` polygons `1464534156` ("Female Academic Zone") and
  `1464534158` ("Male Academic Zone") are also accepted as on-campus zones.

### Buildings (kind `building`, category `Buildings`)

Included when a `building=*` way has its centroid:

1. inside the IIUC campus polygon, or
2. inside an IIUC academic-zone polygon, or
3. a name beginning with `IIUC` / `International Islamic University` (none needed this fallback
   beyond the polygon in the final data).

All 123 included building rings are closed and valid. 170 building ways were excluded because
they are outside the campus polygon (Sonaichhari village, roadside and other non-IIUC buildings
in the bounding box). No building was included merely because it is near the campus.

Amenity-bearing buildings (mosque, library, auditorium, cafeteria, medical centre, post office,
etc.) are seeded once, as buildings, with the amenity recorded in `description`. They are not
duplicated as point POIs.

### Roads and paths (kind `road`, category `Roads & Paths`)

Included `highway=*` ways when the midpoint or any vertex is on campus, or when the name
contains `IIUC`.

- 38 campus service roads, residential roads, footways and paths are included.
- The named `IIUC Road` (way `517844245`) is included as the campus access road even though its
  centreline lies mostly just outside the boundary polygon.
- **Excluded:** all `railway=rail` ways, including the Dhaka–Chittagong Railway. The railway
  crosses the area but is not a campus road.
- **Excluded:** the external Dhaka–Chattogram Highway (N1, `highway=trunk`, ways `653852714` and
  `653860066`). It passes along the western/southern edge and is not the campus access road.
- 18 highway ways wholly outside the campus were excluded.

### POIs (kind `poi`, category `Campus Facilities`)

Included on-campus non-building, non-road ways with `amenity`, `tourism`, `leisure`, `historic`,
`natural=water` (ponds), named `man_made=storage_tank`, named `power=substation`, or named
`landuse=education`; plus named on-campus nodes with `amenity`, `tourism`, `leisure`, `shop`,
`office`, `historic`, or a named natural landmark.

The 22 POIs are:

- the campus boundary polygon (`amenity=university`);
- IIUC Shaheeed Minar (memorial);
- IIUC Central Field, IIUC Basketball ground, IIUC Volleyball ground (sports);
- IIUC Water Treatment Plant, IIUC Substation;
- two IIUC parking areas plus IIUC VIP Car Parking;
- the Female and Male Academic Zone polygons;
- four ponds (one named "iiuc pond", three unnamed), kept with null names in the GeoJSON;
- "Meow" petting zoo (`tourism=zoo`), Hotashar Chottor tree landmark, Allahr Dan Hotel,
  IIUC Flower Nursery, DBA Seminar Library, and IIUC Departmental Store.

Deliberately excluded:

- off-campus roadside restaurants, banks, pharmacies, fuel stations, shops and the cemetery;
- the Dhaka–Chittagong Railway and its level crossings/halt;
- power transmission lines and towers (not campus facilities);
- unnamed flowerbeds, grass and woodland polygons (landscaping, not POIs);
- unnamed toilets/bridges/buildings already represented as building or road geometry.

## Approximations and limitations

- **OSM completeness:** OSM coverage of IIUC is good but not exhaustive. Some real campus
  structures, gates, paths or signs may be missing or unnamed. Nothing was added from memory or
  from Google Maps.
- **Unnamed features:** 135 of 183 features have no OSM `name` tag. The GeoJSON keeps
  `name: null`; the database uses the transparent fallback labels described above.
- **Boundary ambiguity:** the campus polygon is the authoritative OSM boundary. Buildings just
  outside it in Sonaichhari were excluded rather than guessed to be IIUC property. The southern
  lobe of the polygon does contain the female academic zone and the staff dormitory.
- **Label anchors:** `latitude`/`longitude` are derived from geometry (point coordinate, line
  midpoint by length, or polygon area-weighted centroid). They are label anchors, not surveyed
  entrances. `boundary_geojson` always stores the full polygon/line/point geometry, so the map
  can draw actual shapes.
- **Descriptions:** generated only from OSM tags. The extract contains no `building:levels`
  values for these buildings, so level counts are not present; they were not invented.
- **API extract scope:** the OSM API map endpoint returns complete ways/relations that touch the
  bounding box, including some geometry outside it. Off-campus elements were removed by the
  filters above; coordinate range checks in the seeder also guard against bad geometry.
- **Freshness:** counts and names reflect OSM at the download date/time. Re-downloading later
  may produce a different feature set.
- **Feature count vs. guideline:** the extract contains 293 building ways, but only 123 are on
  campus. The other 170 are off-campus buildings (Sonaichhari village / roadside) and were
  deliberately excluded, so the final total is 183 rather than the 250–400 guideline. Reaching
  that range would have required seeding non-campus buildings or inventing features, which the
  quality rules forbid.
- **No live synchronisation:** the seed is a snapshot. It is re-run manually and does not poll
  OSM.

## Seed behaviour

`node scripts/seed-iiuc-campus.js` reads `.env` through `src/config/env.js` and therefore uses
`DATABASE_PATH=./data/app.db`. It:

1. enables `PRAGMA foreign_keys=ON`;
2. ensures the campus categories `Buildings`, `Roads & Paths` and `Campus Facilities` exist;
3. starts a transaction, deletes only rows with `source LIKE 'OpenStreetMap %'`, and inserts one
   row per feature;
4. sets `is_verified=0`, `is_active=1`, `created_by` to the first active admin user (fallback
   `NULL`), and ISO timestamps;
5. verifies every stored `boundary_geojson` parses, prints counts by category, and exits 0.

Re-running the script is idempotent and does not touch user-created or other non-OSM rows.
