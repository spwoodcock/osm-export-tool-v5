<script lang="ts">
  import '@hotosm/ui/dist/components/logo/logo.js';
  import '@hotosm/ui/dist/components/header/header.js';

  import type { Map } from 'maplibre-gl';
  import { MapLibre, CustomControl } from 'svelte-maplibre-gl';
  import { TerraDraw } from '@svelte-maplibre-gl/terradraw';
  import type { TerraDraw as Draw } from 'terra-draw';
  import {
    TerraDrawSelectMode,
    TerraDrawPolygonMode,
    TerraDrawRectangleMode,
  } from 'terra-draw';
  import { bbox } from '@turf/bbox';

  import { importGeoJSONFile, downloadGeoJSON } from './lib/files';
  import { queryPostpass } from './lib/postpass';
  import { extractWithinGeometryQuery } from './lib/queries';

  const defaultSelectFlags = {
    feature: {
      draggable: true,
      coordinates: {
        deletable: true,
        midpoints: true,
        draggable: true
      }
    }
  };
  const modes = [
    new TerraDrawSelectMode({
      flags: {
        polygon: defaultSelectFlags,
        rectangle: defaultSelectFlags,
      }
    }),
    new TerraDrawPolygonMode(),
    new TerraDrawRectangleMode(),
  ];
  const modeNames = modes.map((m) => m.mode);
  let mode = $state('select');
  let map: Map | undefined = $state.raw();
  let draw: Draw | undefined = $state.raw();
  let selected: string | null = $state(null);

  let geometry: GeoJSON.Geometry | null = null;
  let loading = false;
  let extractTypes = {
    buildings: true,
    roads: false,
    water: false
  };

  let dialogEl: HTMLWaDialogElement;

  // Attach TerraDraw event listener once draw is initialized
  $effect(() => {
    if (!draw) return;
    const handleChange = () => {
      const features = draw.getSnapshot();
      if (features && features.length > 0) {
        geometry = features[0].geometry;
      } else {
        geometry = null;
      }
    };

    draw.on('change', handleChange);

    return () => {
      draw.off?.('change', handleChange);
    };
  });

  async function handleImportFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const features = await importGeoJSONFile(file);
      draw?.addFeatures(features);

      if (map && features[0]?.geometry) {
        const [minX, minY, maxX, maxY] = bbox(features[0]);
        map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 800 });
      }
    } catch (err) {
      alert('Invalid GeoJSON file');
      console.error(err);
    }
  }

  async function handleExtract() {
    if (!geometry) {
      alert('Please draw or import a region first.');
      return;
    }

    loading = true;
    try {
      const sql = extractWithinGeometryQuery(geometry, extractTypes);
      const data = await queryPostpass(sql);
      downloadGeoJSON(data, 'extract.geojson');
      dialogEl.open = false;
    } catch (err) {
      console.error(err);
      alert('Extraction failed');
    } finally {
      loading = false;
    }
  }
</script>

<main class="flex flex-col h-screen w-screen">
  <hot-header title="Export Tool" size="small" drawer=""></hot-header>

  <div class="flex-1 relative">
    <MapLibre
      bind:map
      inlineStyle="width: 100%; height: 600px;"
      class="absolute inset-0"
      style="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
      zoom={4}
      center={{ lng: 10, lat: 50 }}
    >
      <TerraDraw
        {mode}
        {modes}
        bind:draw
        onselect={(id) => (selected = id)}
        ondeselect={() => (selected = null)}
        onfinish={() => (mode = 'select')}
      />

      <!-- Drawing mode selector -->
      <CustomControl position="top-left">
        <div class="bg-white/80 rounded p-2 space-y-1 text-sm shadow">
          {#each modeNames as modeName}
            <label class="block">
              <input type="radio" bind:group={mode} value={modeName} class="mr-1" /> {modeName}
            </label>
          {/each}

          {#if selected}
            <button
              class="mt-1 border px-1 rounded w-full"
              on:click={() => {
                if (selected) {
                  draw?.removeFeatures([selected]);
                  draw?.deselectFeature(selected);
                  geometry = null;
                }
              }}
            >
              Remove
            </button>
          {/if}
        </div>
      </CustomControl>

      <!-- Import GeoJSON control -->
      <CustomControl position="top-right">
        <div class="bg-white/80 rounded p-3 shadow text-sm">
          <label class="block font-semibold mb-1">Import GeoJSON</label>
          <input type="file" accept=".geojson,application/geo+json" on:change={handleImportFile} />
        </div>
      </CustomControl>

      <!-- Extract Data popover control -->
      <CustomControl position="bottom-right">
        <div class="relative">
          <wa-popover for="extract-btn">
            <div style="display: flex; flex-direction: column; gap: 1rem; width: 13rem;">
              <p class="text-sm text-gray-700">
                Choose which data layers to extract from the selected region.
              </p>
              <wa-button variant="brand" on:click={() => (dialogEl.open = true)}>
                Open Extract Options
              </wa-button>
            </div>
          </wa-popover>

          <wa-button id="extract-btn" variant="primary" size="large">
            Extract Data
          </wa-button>
        </div>
      </CustomControl>
    </MapLibre>
  </div>

  <!-- Extract dialog -->
  <wa-dialog label="Select data types" bind:this={dialogEl}>
    <div class="space-y-3">
      {#each Object.keys(extractTypes) as type}
        <label class="flex items-center space-x-2">
          <input type="checkbox" bind:checked={extractTypes[type]} />
          <span class="capitalize">{type}</span>
        </label>
      {/each}
    </div>

    <div slot="footer" class="flex justify-end space-x-2 mt-4">
      <wa-button variant="neutral" data-dialog="close">Cancel</wa-button>
      <wa-button variant="brand" disabled={loading} on:click={handleExtract}>
        {loading ? 'Extracting...' : 'Download GeoJSON'}
      </wa-button>
    </div>
  </wa-dialog>
</main>

<style>
  .maplibregl-ctrl button {
    cursor: pointer;
  }
</style>
